const Material     = require('../models/Material');
const Property     = require('../models/Property');
const Floor        = require('../models/Floor');
const Unit         = require('../models/Unit');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const factory      = require('./factory');

const POPULATE = [
    { path: 'property', select: 'propertyName propertyAddress propertyType' },
    {
        path: 'floor',
        select: 'floorNumber floorName totalUnits totalSft assignedAdmin assignedOwner',
        populate: [
            { path: 'assignedAdmin', select: 'name email phone role' },
            { path: 'assignedOwner', select: 'ownerName contactNumber alternateNumber emailId contactPerson designation' },
        ]
    },
    {
        path: 'unit',
        select: 'unitNumber unitType unitStatus sqft ownerName owner',
        populate: { path: 'owner', select: 'ownerName contactNumber alternateNumber emailId contactPerson designation ownerType' }
    },
    { path: 'createdBy',  select: 'name email phone role' },
    { path: 'approvedBy', select: 'name email phone role' },
];

// ── getMaterials — with full population ───────────────────────────────────────
exports.getMaterials = async (req, res) => {
    try {
        let query = {};

        if (req.user && (req.user.role === 'Owner' || req.user.role === 'OFFICE_OWNER')) {
            const user = await User.findById(req.user.id);
            const assignedUnits = user?.assignedUnits || [];
            
            query = {
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id }
                ]
            };
        } else if (req.user && req.user.role === 'FLOOR_ADMIN') {
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds = floors.map(f => f._id);
            query = { floor: { $in: fIds } };
        } else if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = req.user.assignedProperties || [];
            const assignedFloors = req.user.assignedFloors || [];
            if (assignedProps.length === 0 && assignedFloors.length === 0) {
                query = { _id: null };
            } else {
                query.$or = [];
                if (assignedProps.length > 0) {
                    query.$or.push({ property: { $in: assignedProps } });
                }
                if (assignedFloors.length > 0) {
                    query.$or.push({ floor: { $in: assignedFloors } });
                }
            }
        }

        // Apply filters
        const andConditions = [];
        if (Object.keys(query).length > 0) {
            andConditions.push(query);
        }

        // Date Filter
        if (req.query.dateFilter) {
            const todayStr = new Date().toISOString().split('T')[0];
            if (req.query.dateFilter === 'Today') {
                const start = new Date();
                start.setHours(0,0,0,0);
                const end = new Date();
                end.setHours(23,59,59,999);
                andConditions.push({ createdAt: { $gte: start, $lte: end } });
            } else if (req.query.dateFilter === 'Yesterday') {
                const start = new Date();
                start.setDate(start.getDate() - 1);
                start.setHours(0,0,0,0);
                const end = new Date();
                end.setDate(end.getDate() - 1);
                end.setHours(23,59,59,999);
                andConditions.push({ createdAt: { $gte: start, $lte: end } });
            } else if (req.query.dateFilter !== 'Select Date' && req.query.dateFilter !== '') {
                const start = new Date(req.query.dateFilter);
                start.setHours(0,0,0,0);
                const end = new Date(req.query.dateFilter);
                end.setHours(23,59,59,999);
                andConditions.push({ createdAt: { $gte: start, $lte: end } });
            }
        }

        // Status Filter
        if (req.query.status && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }

        // Gate Pass Type Filter (Inward / Outward)
        if (req.query.gatePassType && req.query.gatePassType !== 'All') {
            andConditions.push({ gatePassType: req.query.gatePassType });
        }

        // Search Filter
        if (req.query.search) {
            const regex = new RegExp(req.query.search, 'i');
            andConditions.push({
                $or: [
                    { companyName: regex },
                    { contactPerson: regex },
                    { contactNumber: regex },
                    { materialDetails: regex },
                    { vehicleNumber: regex },
                    { gatePassNo: regex }
                ]
            });
        }

        const finalQuery = andConditions.length > 0 ? { $and: andConditions } : {};

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;

        const total = await Material.countDocuments(finalQuery);

        const data = await Material.find(finalQuery)
            .populate(POPULATE)
            .sort('-createdAt')
            .skip(startIndex)
            .limit(limit);

        res.status(200).json({ 
            success: true, 
            count: data.length, 
            total,
            page,
            pages: Math.ceil(total / limit) || 1,
            data 
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// ── getMaterial (single) — with full population ───────────────────────────────
exports.getMaterial = async (req, res) => {
    try {
        const data = await Material.findById(req.params.id).populate(POPULATE);
        if (!data) return res.status(404).json({ success: false, error: 'Gate pass not found' });

        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
            const assignedFloors = (req.user.assignedFloors || []).map(id => id.toString());
            const isPropAssigned = assignedProps.includes(data.property?._id?.toString() || data.property?.toString());
            const isFloorAssigned = assignedFloors.includes(data.floor?._id?.toString() || data.floor?.toString());
            if (!isPropAssigned && !isFloorAssigned) {
                return res.status(403).json({ success: false, error: 'Not authorized to access this gate pass record' });
            }
        }
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updateMaterial = factory.updateOne(Material);

// ── Custom createMaterial with approval-level notification ────────────────────
exports.createMaterial = async (req, res, next) => {
    try {
        const {
            property: propertyId,
            floor: floorId,
            unit: unitId,
            approvalLevel,
            ...rest
        } = req.body;

        // Resolve approval level automatically if not provided
        let resolvedLevel = 'Property Level';
        if (unitId)    resolvedLevel = 'Office Level';
        else if (floorId)  resolvedLevel = 'Floor Level';
        else if (propertyId) resolvedLevel = 'Property Level';

        const material = await Material.create({
            ...rest,
            property: propertyId || undefined,
            floor:    floorId    || undefined,
            unit:     unitId     || undefined,
            approvalLevel: approvalLevel || resolvedLevel,
            createdBy: req.user?._id,
            status: 'Pending'
        });

        // ── Fire notification to the appropriate authority ────────────────────
        try {
            let recipientUserId = null;
            let authorityLabel  = '';

            if (resolvedLevel === 'Office Level' && unitId) {
                // Notify the unit owner's user account
                const unit = await Unit.findById(unitId).populate('owner');
                if (unit?.owner?.user) {
                    recipientUserId = unit.owner.user;
                    authorityLabel  = `OFFICE_OWNER (Unit ${unit.unitNumber})`;
                }
            } else if (resolvedLevel === 'Floor Level' && floorId) {
                // Notify the floor admin
                const floor = await Floor.findById(floorId);
                if (floor?.assignedAdmin) {
                    recipientUserId = floor.assignedAdmin;
                    authorityLabel  = `FLOOR_ADMIN (Floor ${floor.floorNumber})`;
                } else if (floor?.assignedOwner) {
                    const owner = await require('../models/Owner').findById(floor.assignedOwner);
                    recipientUserId = owner?.user;
                    authorityLabel  = `Floor Owner (Floor ${floor.floorNumber})`;
                }
            } else if (resolvedLevel === 'Property Level' && propertyId) {
                // Notify SUPER_ADMIN or Property Creator
                const property = await Property.findById(propertyId).populate('createdBy');
                recipientUserId = property?.createdBy?._id || property?.createdBy;
                authorityLabel  = `Property Owner (${property?.propertyName})`;
            }

            // Fallback: notify all SUPER_ADMINs
            if (!recipientUserId) {
                const superAdmins = await User.find({ role: 'SUPER_ADMIN' }).select('_id');
                for (const admin of superAdmins) {
                    await Notification.create({
                        user: admin._id,
                        title: 'Gate Pass Request',
                        message: `A new Gate Pass (${material.gatePassType}) has been submitted for "${material.materialDetails}". Approval Level: ${resolvedLevel}.`,
                        type: 'Alert'
                    });
                }
            } else {
                await Notification.create({
                    user: recipientUserId,
                    title: 'Gate Pass Approval Required',
                    message: `A new Gate Pass (${material.gatePassType}) for "${material.materialDetails}" requires your approval as ${authorityLabel}.`,
                    type: 'Alert'
                });
            }
        } catch (notifErr) {
            // Non-fatal: log but don't block response
            console.error('Notification error:', notifErr.message);
        }

        res.status(201).json({ success: true, data: material });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// ── Approve / Reject a Gate Pass ──────────────────────────────────────────────
exports.approveGatePass = async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;
        const allowed = ['Approved', 'Rejected', 'Cleared'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const update = {
            status,
            approvedBy: req.user?._id,
            approvedAt: new Date()
        };
        if (status === 'Rejected' && rejectionReason) {
            update.rejectionReason = rejectionReason;
        }

        const material = await Material.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!material) return res.status(404).json({ success: false, error: 'Gate pass not found' });

        res.status(200).json({ success: true, data: material });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// ── Check-Out / Clear (Watchman/Security) ───────────────────────────────────────
exports.checkOutMaterial = async (req, res) => {
    try {
        const material = await Material.findById(req.params.id);
        if (!material) return res.status(404).json({ success: false, error: 'Gate pass not found' });
        if (material.status === 'Cleared')
            return res.status(400).json({ success: false, error: 'Gate pass is already cleared' });

        material.status  = 'Cleared';
        material.outTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        material.outDate = new Date().toISOString().split('T')[0];
        if (req.user) {
            material.approvedBy = req.user._id;
            material.approvedAt = new Date();
        }
        await material.save();
        const populated = await Material.findById(material._id).populate(POPULATE);
        res.status(200).json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
