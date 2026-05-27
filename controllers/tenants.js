const Tenant = require('../models/Tenant');

// @desc    Get all tenants
exports.getTenants = async (req, res, next) => {
    try {
        let query = {};
        if (req.user) {
            if (req.user.role === 'Tenant') {
                query.user = req.user._id;
            } else if (req.user.role === 'Floor Admin') {
                const Floor = require('../models/Floor');
                const Lease = require('../models/Lease');
                const floors = await Floor.find({ assignedAdmin: req.user._id });
                const fIds = floors.map(f => f._id);
                const leases = await Lease.find({ floor: { $in: fIds } }).select('_id');
                const leaseIds = leases.map(l => l._id);
                query.lease = { $in: leaseIds };
            } else if (req.user.role === 'Owner' || req.user.role === 'Office Owner') {
                const Floor = require('../models/Floor');
                const Lease = require('../models/Lease');
                const Owner = require('../models/Owner');
                const owner = await Owner.findOne({ user: req.user._id });
                if (owner) {
                    const floors = await Floor.find({ assignedOwner: owner._id });
                    const fIds = floors.map(f => f._id);
                    const leases = await Lease.find({ floor: { $in: fIds } }).select('_id');
                    const leaseIds = leases.map(l => l._id);
                    query.lease = { $in: leaseIds };
                } else {
                    query.lease = { $in: [] };
                }
            }
        }

        const tenants = await Tenant.find(query);
        res.status(200).json({ success: true, count: tenants.length, data: tenants });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get single tenant
exports.getTenant = async (req, res, next) => {
    try {
        const tenant = await Tenant.findById(req.params.id);
        if (!tenant) {
            return res.status(404).json({ success: false, error: `Tenant not found with id of ${req.params.id}` });
        }
        
        if (req.user && req.user.role === 'Tenant' && tenant.user?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to access this tenant profile' });
        }

        res.status(200).json({ success: true, data: tenant });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create new tenant
exports.createTenant = async (req, res, next) => {
    try {
        const tenant = await Tenant.create(req.body);
        res.status(201).json({ success: true, data: tenant });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update tenant
exports.updateTenant = async (req, res, next) => {
    try {
        let tenant = await Tenant.findById(req.params.id);
        if (!tenant) {
            return res.status(404).json({ success: false, error: `Tenant not found with id of ${req.params.id}` });
        }

        if (req.user && req.user.role === 'Tenant' && tenant.user?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to update this tenant profile' });
        }

        tenant = await Tenant.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        res.status(200).json({ success: true, data: tenant });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Delete tenant
exports.deleteTenant = async (req, res, next) => {
    try {
        const tenant = await Tenant.findById(req.params.id);
        if (!tenant) {
            return res.status(404).json({ success: false, error: `Tenant not found with id of ${req.params.id}` });
        }
        await tenant.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
