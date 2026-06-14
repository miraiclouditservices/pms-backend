const Payment = require('../models/Payment');
const Lease = require('../models/Lease');

exports.getPayments = async (req, res, next) => {
    try {
        let query = {};
        
        if (req.user) {
            if (req.user.role === 'Tenant') {
                const tenant = await require('mongoose').model('Tenant').findOne({ user: req.user._id });
                if (!tenant) return res.status(200).json({ success: true, count: 0, data: [], pagination: { page: 1, limit: 20, totalPages: 0, totalPayments: 0 } });
                query.lease = tenant.lease;
            } else if (req.user.role === 'FLOOR_ADMIN') {
                const Floor = require('../models/Floor');
                const Lease = require('../models/Lease');
                const floors = await Floor.find({ assignedAdmin: req.user._id });
                const fIds = floors.map(f => f._id);
                const leases = await Lease.find({ floor: { $in: fIds } });
                const leaseIds = leases.map(l => l._id);
                query.lease = { $in: leaseIds };
            } else if (req.user.role === 'Owner' || req.user.role === 'OFFICE_OWNER') {
                const Floor = require('../models/Floor');
                const Lease = require('../models/Lease');
                const Owner = require('../models/Owner');
                const owner = await Owner.findOne({ user: req.user._id });
                if (owner) {
                    const floors = await Floor.find({ assignedOwner: owner._id });
                    const fIds = floors.map(f => f._id);
                    const leases = await Lease.find({ floor: { $in: fIds } });
                    const leaseIds = leases.map(l => l._id);
                    query.lease = { $in: leaseIds };
                } else {
                    query.lease = { $in: [] };
                }
            } else if (req.user.role === 'STAFF_ADMIN') {
                const assignedProps = req.user.assignedProperties || [];
                const assignedFloors = req.user.assignedFloors || [];
                if (assignedProps.length === 0 && assignedFloors.length === 0) {
                    query.lease = { $in: [] };
                } else {
                    const Lease = require('../models/Lease');
                    const orConditions = [];
                    if (assignedProps.length > 0) {
                        orConditions.push({ property: { $in: assignedProps } });
                    }
                    if (assignedFloors.length > 0) {
                        orConditions.push({ floor: { $in: assignedFloors } });
                    }
                    const leases = await Lease.find({ $or: orConditions });
                    const leaseIds = leases.map(l => l._id);
                    query.lease = { $in: leaseIds };
                }
            }
        }

        // Apply dynamic query filters
        // 1. Lease Specific Filter
        if (req.query.lease) {
            if (query.lease) {
                if (query.lease.$in && Array.isArray(query.lease.$in)) {
                    if (query.lease.$in.map(id => id.toString()).includes(req.query.lease.toString())) {
                        query.lease = req.query.lease;
                    } else {
                        query.lease = null; // No access
                    }
                } else if (query.lease.toString() === req.query.lease.toString()) {
                    query.lease = req.query.lease;
                } else {
                    query.lease = null; // No access
                }
            } else {
                query.lease = req.query.lease;
            }
        }

        // 2. Search query (matches tenantName regex on populated Lease or transactionId on Payment)
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const matchingLeases = await Lease.find({ tenantName: searchRegex }).select('_id');
            const leaseIds = matchingLeases.map(l => l._id);

            const orConditions = [
                { transactionId: searchRegex }
            ];

            if (query.lease) {
                if (query.lease.$in) {
                    const permittedIds = query.lease.$in.map(id => id.toString());
                    const intersectIds = leaseIds.filter(id => permittedIds.includes(id.toString()));
                    orConditions.push({ lease: { $in: intersectIds } });
                } else {
                    const permittedStr = query.lease.toString();
                    if (leaseIds.map(id => id.toString()).includes(permittedStr)) {
                        orConditions.push({ lease: query.lease });
                    } else {
                        // Permitted lease doesn't match search, so force match nothing
                        orConditions.push({ lease: null });
                    }
                }
            } else {
                orConditions.push({ lease: { $in: leaseIds } });
            }

            delete query.lease;
            query.$or = orConditions;
        }

        // 3. Payment Method Filter
        if (req.query.paymentMethod && req.query.paymentMethod !== 'All') {
            query.paymentMethod = req.query.paymentMethod;
        }

        // 4. Month & Year Filters
        if (req.query.month && req.query.month !== 'All') {
            query.month = req.query.month;
        }
        if (req.query.year) {
            query.year = Number(req.query.year);
        }

        // 5. Amount Range Filter
        if (req.query.minAmount || req.query.maxAmount) {
            query.amount = {};
            if (req.query.minAmount) {
                query.amount.$gte = Number(req.query.minAmount);
            }
            if (req.query.maxAmount) {
                query.amount.$lte = Number(req.query.maxAmount);
            }
        }

        // 6. Date Range Filter
        if (req.query.startDate || req.query.endDate) {
            query.paymentDate = {};
            if (req.query.startDate) {
                query.paymentDate.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                const end = new Date(req.query.endDate);
                end.setHours(23, 59, 59, 999);
                query.paymentDate.$lte = end;
            }
        }

        // 7. Status Filter (Paid vs Unpaid)
        if (req.query.status) {
            if (req.query.status === 'Paid') {
                query.status = 'Paid';
            } else if (req.query.status === 'Unpaid') {
                query.status = { $ne: 'Paid' };
            }
        }

        // Pagination setup
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const startIndex = (page - 1) * limit;

        const totalPayments = await Payment.countDocuments(query);
        const totalPages = Math.ceil(totalPayments / limit);

        // Sorting: Latest first
        const sort = { paymentDate: -1, createdAt: -1 };

        // Calculate overall stats for the current filter query (without pagination limit)
        const allMatchingPayments = await Payment.find(query).select('amount');
        const totalPaymentsCollected = allMatchingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalTransactions = allMatchingPayments.length;
        const avgTxnValue = totalTransactions > 0 ? Math.round(totalPaymentsCollected / totalTransactions) : 0;

        const payments = await Payment.find(query)
            .populate('lease', 'tenantName')
            .sort(sort)
            .skip(startIndex)
            .limit(limit);

        res.status(200).json({
            success: true,
            count: payments.length,
            pagination: {
                page,
                limit,
                totalPages,
                totalPayments
            },
            summary: {
                totalCollected: totalPaymentsCollected,
                totalTransactions,
                avgTxnValue
            },
            data: payments
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createPayment = async (req, res, next) => {
    try {
        const payment = await Payment.create(req.body);

        // Mark corresponding invoice as Paid
        const Finance = require('../models/Finance');
        await Finance.findOneAndUpdate(
            { lease: payment.lease, month: payment.month, year: payment.year },
            { status: 'Paid' }
        );

        res.status(201).json({
            success: true,
            data: payment
        });
    } catch (err) {
        // Handle duplicate index error
        if (err.code === 11000) {
            return res.status(400).json({ 
                success: false, 
                error: 'Payment for this month and year already exists for this lease.' 
            });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updatePayment = async (req, res, next) => {
    try {
        const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment record not found' });
        }

        res.status(200).json({
            success: true,
            data: payment
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deletePayment = async (req, res, next) => {
    try {
        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment record not found' });
        }

        // Revert corresponding invoice status to Pending
        const Finance = require('../models/Finance');
        await Finance.findOneAndUpdate(
            { lease: payment.lease, month: payment.month, year: payment.year },
            { status: 'Pending' }
        );

        await payment.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
