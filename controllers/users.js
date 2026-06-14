const User = require('../models/User');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
    try {
        let query = {};
        if (req.user) {
            if (req.user.role === 'SUPER_ADMIN') {
                // Super admin sees all users
                query = {};
            } else if (req.user.role === 'FLOOR_ADMIN') {
                // Floor admin sees only users they created or themselves
                query = {
                    $or: [
                        { createdBy: req.user._id },
                        { _id: req.user._id }
                    ]
                };
            } else {
                query._id = req.user._id;
            }
        }

        // 1. Role filter
        if (req.query.role && req.query.role !== 'All Roles') {
            if (req.query.role.includes(',')) {
                query.role = { $in: req.query.role.split(',') };
            } else {
                query.role = req.query.role;
            }
        }

        // 2. Agreement Status filter
        if (req.query.agreementStatus && req.query.agreementStatus !== 'All') {
            query.agreementStatus = req.query.agreementStatus;
        }

        // 3. Staff Category filter
        if (req.query.staffCategory && req.query.staffCategory !== 'All') {
            query.staffCategory = req.query.staffCategory;
        }

        // 3b. Payment Status filter
        if (req.query.paymentStatus && req.query.paymentStatus !== 'All') {
            query.paymentStatus = req.query.paymentStatus;
        }

        // 4. Search functionality
        if (req.query.search && req.query.search.trim() !== '') {
            const searchRegex = new RegExp(req.query.search.trim(), 'i');
            const searchQueryObj = {
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phoneNumber: searchRegex },
                    { address: searchRegex },
                    { staffCategory: searchRegex },
                    { role: searchRegex }
                ]
            };
            if (query.$or) {
                query = { $and: [ { $or: query.$or }, searchQueryObj ] };
            } else {
                Object.assign(query, searchQueryObj);
            }
        }

        // 5. Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 0;

        let total = 0;
        let users;

        if (limit > 0) {
            const startIndex = (page - 1) * limit;
            total = await User.countDocuments(query);
            users = await User.find(query)
                .sort({ createdAt: -1 })
                .skip(startIndex)
                .limit(limit);

            res.status(200).json({
                success: true,
                data: users,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            });
        } else {
            users = await User.find(query).sort({ createdAt: -1 });
            res.status(200).json({
                success: true,
                data: users
            });
        }
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (req.user && req.user.role === 'STAFF_ADMIN' && req.params.id !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to view this user profile' });
        }
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Role hierarchy checker for creation and role assignment
const checkHierarchy = (currentUserRole, targetRole) => {
    if (currentUserRole === 'SUPER_ADMIN') return true;
    if (currentUserRole === 'OFFICE_OWNER' && targetRole === 'FLOOR_ADMIN') return true;
    if (currentUserRole === 'FLOOR_ADMIN' && targetRole === 'STAFF_ADMIN') return true;
    return false;
};

// @desc    Create user
// @route   POST /api/users
// @access  Private/Admin
exports.createUser = async (req, res, next) => {
    try {
        const { role } = req.body;
        if (req.user && role && !checkHierarchy(req.user.role, role)) {
            return res.status(403).json({ success: false, error: 'Authorization Error: You do not have permission to create a user with this role.' });
        }



        // PRE-VALIDATION: Prevent FLOOR_ADMINs from assigning properties/floors/units outside their management
        if (req.user && req.user.role === 'FLOOR_ADMIN') {
            const Floor = require('../models/Floor');
            const Unit = require('../models/Unit');
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds = floors.map(f => f._id.toString());
            const propertyIds = floors.map(f => f.property?.toString()).filter(Boolean);

            if (req.body.assignedFloors && req.body.assignedFloors.length > 0) {
                const invalidFloors = req.body.assignedFloors.filter(fid => !fIds.includes(fid.toString()));
                if (invalidFloors.length > 0) {
                    return res.status(400).json({ success: false, error: 'Validation Error: Cannot assign floors outside your managed floor assignments.' });
                }
            } else if (req.body.assignedUnits && req.body.assignedUnits.length > 0) {
                const units = await Unit.find({ _id: { $in: req.body.assignedUnits } }).select('floor');
                const invalidUnits = units.filter(u => !u.floor || !fIds.includes(u.floor.toString()));
                if (invalidUnits.length > 0) {
                    return res.status(400).json({ success: false, error: 'Validation Error: Cannot assign units outside your managed floors.' });
                }
            }

            if (req.body.assignedProperties && req.body.assignedProperties.length > 0) {
                const invalidProps = req.body.assignedProperties.filter(pid => !propertyIds.includes(pid.toString()));
                if (invalidProps.length > 0) {
                    return res.status(400).json({ success: false, error: 'Validation Error: Cannot assign properties outside your managed floors.' });
                }
            }
        }

        if (req.user) {
            req.body.createdBy = req.user._id;
        }
        const user = await User.create(req.body);

        // Create welcome/assignment notification for the provisioned user
        if (user.role === 'FLOOR_ADMIN' || user.role === 'OFFICE_OWNER') {
            const Notification = require('../models/Notification');
            const formattedStart = user.floorAssignmentStartDate ? new Date(user.floorAssignmentStartDate).toLocaleDateString() : 'N/A';
            const formattedEnd = user.floorAssignmentEndDate ? new Date(user.floorAssignmentEndDate).toLocaleDateString() : 'N/A';

            await Notification.create({
                user: user._id,
                title: user.role === 'FLOOR_ADMIN' ? 'Floor Assignment Activated' : 'Office Agreement Activated',
                message: `Hello ${user.name}, your account has been provisioned as ${user.role}. Your assignment is active from ${formattedStart} to ${formattedEnd}. Monthly Management Amount: ₹${user.monthlyManagementAmount || 0}.`,
                type: 'Info'
            });
        }

        // Handle Role-based Profile Creation and Floor Assignments
        if (user.role === 'OFFICE_OWNER' || user.role === 'Owner') {
            const Owner = require('../models/Owner');
            const newOwner = await Owner.create({
                ownerName: user.name,
                contactNumber: req.body.phoneNumber || 'N/A',
                emailId: user.email,
                ownerType: 'Individual',
                user: user._id
            });

            // Note: We do NOT assign Floor.assignedOwner for OFFICE_OWNERs since multiple OFFICE_OWNERs can occupy a Floor.
            // Floor.assignedOwner is reserved for whole-floor ownership.

            // Assign units to this newly created owner
            if (req.body.assignedUnits && req.body.assignedUnits.length > 0) {
                const Unit = require('../models/Unit');
                for (const unitId of req.body.assignedUnits) {
                    await Unit.findByIdAndUpdate(unitId, {
                        owner: newOwner._id,
                        ownerName: newOwner.ownerName,
                        unitStatus: 'Occupied',
                        tenant: null, // Clear any previous tenant mapping just in case
                    });
                }
            }
        } else if (user.role === 'FLOOR_ADMIN') {
            if (req.body.assignedFloors && req.body.assignedFloors.length > 0) {
                const Floor = require('../models/Floor');
                for (const floorId of req.body.assignedFloors) {
                    await Floor.findByIdAndUpdate(floorId, {
                        assignedAdmin: user._id
                    });
                }
            }
        }

        res.status(201).json({
            success: true,
            data: user
        });
    } catch (err) {
        if (err.code === 11000) {
            let field = 'input';
            if (err.keyValue) {
                const keys = Object.keys(err.keyValue);
                if (keys.length > 0) {
                    field = keys[0];
                }
            } else if (err.message && err.message.includes('email_1')) {
                field = 'email';
            } else if (err.message && err.message.includes('phoneNumber')) {
                field = 'phoneNumber';
            }

            let message = 'A duplicate record already exists in our database.';
            if (field === 'email') {
                message = 'The email address you entered is already registered with another account.';
            } else if (field === 'phoneNumber') {
                message = 'The primary phone number you entered is already in use by another user.';
            }
            return res.status(400).json({ success: false, error: message });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res, next) => {
    try {
        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (req.user) {
            const isSelf = user._id.toString() === req.user._id.toString();
            const isCreatedByMe = user.createdBy && user.createdBy.toString() === req.user._id.toString();
            if (!isSelf && !isCreatedByMe && req.user.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ success: false, error: 'Authorization Error: You are not authorized to update this user.' });
            }
        }

        // Check hierarchy if role is being updated
        if (req.user && req.body.role && req.body.role !== user.role) {
            if (!checkHierarchy(req.user.role, req.body.role)) {
                return res.status(403).json({ success: false, error: 'Authorization Error: You do not have permission to assign this role.' });
            }
        }

        const oldAssignedFloors = user.assignedFloors || [];
        const oldAssignedUnits = user.assignedUnits || [];

        // If password is provided, it will be hashed by pre-save hook
        user = await User.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Sync floor and unit assignments for FLOOR_ADMIN
        if (user.role === 'FLOOR_ADMIN') {
            const Floor = require('../models/Floor');

            // Clear old floors
            if (oldAssignedFloors.length > 0) {
                await Floor.updateMany(
                    { _id: { $in: oldAssignedFloors }, assignedAdmin: user._id },
                    { assignedAdmin: null }
                );
            }

            // Assign new floors
            if (user.assignedFloors && user.assignedFloors.length > 0) {
                await Floor.updateMany(
                    { _id: { $in: user.assignedFloors } },
                    { assignedAdmin: user._id }
                );
            }
        }

        // Sync for OFFICE_OWNER
        if (user.role === 'OFFICE_OWNER' || user.role === 'Owner') {
            const Owner = require('../models/Owner');
            let ownerProfile = await Owner.findOne({ user: user._id });
            if (!ownerProfile) {
                ownerProfile = await Owner.create({
                    ownerName: user.name,
                    contactNumber: user.phoneNumber || 'N/A',
                    emailId: user.email,
                    ownerType: 'Individual',
                    user: user._id
                });
            } else {
                ownerProfile.ownerName = user.name;
                ownerProfile.contactNumber = user.phoneNumber || 'N/A';
                ownerProfile.emailId = user.email;
                await ownerProfile.save();
            }

            // Note: We do NOT assign Floor.assignedOwner for OFFICE_OWNERs since multiple OFFICE_OWNERs can occupy a Floor.

            const Unit = require('../models/Unit');
            // Clear old units
            if (oldAssignedUnits.length > 0) {
                await Unit.updateMany(
                    { _id: { $in: oldAssignedUnits }, owner: ownerProfile._id },
                    { owner: null, ownerName: '', unitStatus: 'Available' }
                );
            }

            // Assign new units
            if (user.assignedUnits && user.assignedUnits.length > 0) {
                await Unit.updateMany(
                    { _id: { $in: user.assignedUnits } },
                    { owner: ownerProfile._id, ownerName: ownerProfile.ownerName, unitStatus: 'Occupied' }
                );
            }

            // If agreementStatus changes to non-Active, release all assigned units to Available
            if (user.agreementStatus !== 'Active') {
                await Unit.updateMany(
                    { owner: ownerProfile._id },
                    { owner: null, ownerName: '', unitStatus: 'Available' }
                );
            }
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        if (err.code === 11000) {
            let field = 'input';
            if (err.keyValue) {
                const keys = Object.keys(err.keyValue);
                if (keys.length > 0) {
                    field = keys[0];
                }
            } else if (err.message && err.message.includes('email_1')) {
                field = 'email';
            } else if (err.message && err.message.includes('phoneNumber')) {
                field = 'phoneNumber';
            }

            let message = 'A duplicate record already exists in our database.';
            if (field === 'email') {
                message = 'The email address you entered is already registered with another account.';
            } else if (field === 'phoneNumber') {
                message = 'The primary phone number you entered is already in use by another user.';
            }
            return res.status(400).json({ success: false, error: message });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Authorization check for deletion
        if (req.user) {
            const isCreatedByMe = user.createdBy && user.createdBy.toString() === req.user._id.toString();
            if (!isCreatedByMe && req.user.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ success: false, error: 'Authorization Error: You are not authorized to delete this user.' });
            }
        }

        if (req.user && user.role) {
            if (req.user.role !== 'SUPER_ADMIN' && !checkHierarchy(req.user.role, user.role)) {
                return res.status(403).json({ success: false, error: 'Authorization Error: You do not have permission to delete this user.' });
            }
        }

        // Clean up assignments
        const Floor = require('../models/Floor');
        await Floor.updateMany({ assignedAdmin: user._id }, { assignedAdmin: null });

        const Owner = require('../models/Owner');
        const ownerProfile = await Owner.findOne({ user: user._id });
        if (ownerProfile) {
            await Floor.updateMany({ assignedOwner: ownerProfile._id }, { assignedOwner: null });

            const Unit = require('../models/Unit');
            await Unit.updateMany({ owner: ownerProfile._id }, { owner: null, ownerName: '', unitStatus: 'Available' });

            await ownerProfile.deleteOne();
        }

        await user.deleteOne();
        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get user billing info (invoices & summary)
// @route   GET /api/users/:id/billing
// @access  Private/Admin
exports.getUserBilling = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const Finance = require('../models/Finance');
        const Payment = require('../models/Payment');
        const Lease = require('../models/Lease');

        let leaseQuery = {};
        if (user.role === 'Tenant') {
            const Tenant = require('../models/Tenant');
            const tenant = await Tenant.findOne({ user: user._id });
            if (tenant && tenant.lease) {
                leaseQuery._id = tenant.lease;
            } else {
                leaseQuery = { $or: [{ tenantEmail: user.email }, { tenantContact: user.phoneNumber }] };
            }
        } else if (user.role === 'FLOOR_ADMIN') {
            leaseQuery.floor = { $in: user.assignedFloors || [] };
        } else if (user.role === 'OFFICE_OWNER' || user.role === 'Owner') {
            leaseQuery.units = { $in: user.assignedUnits || [] };
        } else {
            leaseQuery._id = null;
        }

        const leases = await Lease.find({
            $or: [
                leaseQuery,
                { tenantName: user.name },
                { tenantEmail: user.email }
            ]
        });
        const leaseIds = leases.map(l => l._id);

        // Fetch real invoices matching this user context
        const invoices = await Finance.find({
            $or: [
                { lease: { $in: leaseIds } },
                { floor: { $in: user.assignedFloors || [] } },
                { tenantName: user.name }
            ]
        }).sort('-createdAt');

        // Fetch real payments matching this user context
        const payments = await Payment.find({
            lease: { $in: leaseIds }
        }).sort('-createdAt');

        const mappedInvoices = invoices.map(inv => {
            const isPaid = inv.status === 'Paid';
            const matchedPayment = payments.find(p => p.lease.toString() === inv.lease?.toString() && p.month === inv.month && p.year === inv.year);
            
            return {
                invoiceId: inv.invoiceNumber || `INV-${inv.year}-${inv.month.slice(0,3).toUpperCase()}`,
                billingPeriod: `${inv.month} ${inv.year}`,
                amount: inv.totalAmount || 0,
                dueDate: inv.dueDate,
                paidDate: matchedPayment ? matchedPayment.paymentDate : (isPaid ? inv.createdAt : null),
                status: inv.status,
                receiptUrl: '#'
            };
        });

        // Compute dynamic summary sums
        const totalBilled = mappedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
        const totalPaid = mappedInvoices.filter(inv => inv.status === 'Paid').reduce((sum, inv) => sum + inv.amount, 0);
        const pendingAmount = mappedInvoices.filter(inv => inv.status === 'Pending').reduce((sum, inv) => sum + inv.amount, 0);
        const overdueAmount = mappedInvoices.filter(inv => inv.status === 'Overdue').reduce((sum, inv) => sum + inv.amount, 0);

        res.status(200).json({
            success: true,
            data: {
                invoices: mappedInvoices,
                summary: {
                    totalBilled,
                    totalPaid,
                    pendingAmount,
                    overdueAmount
                }
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
