const Lease = require('../models/Lease');
const Unit = require('../models/Unit');
const Owner = require('../models/Owner');
const factory = require('./factory');

exports.getLeases = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        let query = {};
        
        // If Owner, show only their leases
        if (req.user.role === 'Owner') {
            const owner = await Owner.findOne({ user: req.user._id });
            if (owner) {
                query.owner = owner._id;
            } else {
                return res.status(200).json({
                    success: true,
                    total: 0,
                    pagination: {
                        page,
                        limit,
                        totalPages: 0
                    },
                    data: []
                });
            }
        }

        if (search) {
            query.$or = [
                { tenantName: { $regex: search, $options: 'i' } },
                { tenantContact: { $regex: search, $options: 'i' } }
            ];
        }

        if (req.query.status) {
            query.status = req.query.status;
        }

        const total = await Lease.countDocuments(query);
        const leases = await Lease.find(query)
            .populate('owner', 'ownerName contactNumber')
            .populate({
                path: 'units',
                populate: { path: 'property', select: 'propertyName building' }
            })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            total,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            data: leases
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.getLease = async (req, res, next) => {
    try {
        const lease = await Lease.findById(req.params.id)
            .populate('owner')
            .populate({
                path: 'units',
                populate: { path: 'property', select: 'propertyName building' }
            });

        if (!lease) {
            return res.status(404).json({ success: false, error: 'Lease not found' });
        }

        res.status(200).json({
            success: true,
            data: lease
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createLease = async (req, res, next) => {
    try {
        const lease = await Lease.create(req.body);

        // Update unit status to 'Occupied' for all linked units
        if (lease.units && lease.units.length > 0) {
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Occupied' }
            );
        }

        res.status(201).json({
            success: true,
            data: lease
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updateLease = async (req, res, next) => {
    try {
        const oldLease = await Lease.findById(req.params.id);
        if (!oldLease) {
            return res.status(404).json({ success: false, error: 'Lease not found' });
        }

        // Reset old units to Vacant before update
        if (oldLease.units && oldLease.units.length > 0) {
            await Unit.updateMany(
                { _id: { $in: oldLease.units } },
                { unitStatus: 'Vacant' }
            );
        }

        const lease = await Lease.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Set new/updated units to Occupied
        if (lease.units && lease.units.length > 0 && lease.status === 'Active') {
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Occupied' }
            );
        }

        res.status(200).json({
            success: true,
            data: lease
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteLease = async (req, res, next) => {
    try {
        const lease = await Lease.findById(req.params.id);
        if (!lease) {
            return res.status(404).json({ success: false, error: 'Lease not found' });
        }

        // Restore units to Vacant before deleting lease
        if (lease.units && lease.units.length > 0) {
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Vacant' }
            );
        }

        await Lease.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
