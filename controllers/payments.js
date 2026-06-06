const Payment = require('../models/Payment');
const Lease = require('../models/Lease');

exports.getPayments = async (req, res, next) => {
    try {
        let query = {};
        
        if (req.user) {
            if (req.user.role === 'Tenant') {
                const tenant = await require('mongoose').model('Tenant').findOne({ user: req.user._id });
                if (!tenant) return res.status(200).json({ success: true, data: [] });
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

        const payments = await Payment.find(query)
            .populate('lease', 'tenantName')
            .sort({ year: -1, month: -1 });

        res.status(200).json({
            success: true,
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
