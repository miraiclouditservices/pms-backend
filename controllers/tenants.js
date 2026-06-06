const Tenant = require('../models/Tenant');

// @desc    Get all tenants
exports.getTenants = async (req, res, next) => {
    try {
        let query = {};
        if (req.user) {
            if (req.user.role === 'Tenant') {
                query.user = req.user._id;
            } else if (req.user.role === 'FLOOR_ADMIN') {
                const Floor = require('../models/Floor');
                const Lease = require('../models/Lease');
                const floors = await Floor.find({ assignedAdmin: req.user._id });
                const fIds = floors.map(f => f._id);
                const leases = await Lease.find({ floor: { $in: fIds } }).select('_id');
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
                    const leases = await Lease.find({ floor: { $in: fIds } }).select('_id');
                    const leaseIds = leases.map(l => l._id);
                    query.lease = { $in: leaseIds };
                } else {
                    query.lease = { $in: [] };
                }
            } else if (req.user.role === 'STAFF_ADMIN') {
                const Lease = require('../models/Lease');
                const assignedProps = req.user.assignedProperties || [];
                const assignedFloors = req.user.assignedFloors || [];
                if (assignedProps.length === 0 && assignedFloors.length === 0) {
                    query.lease = { $in: [] };
                } else {
                    const orConditions = [];
                    if (assignedProps.length > 0) {
                        orConditions.push({ property: { $in: assignedProps } });
                    }
                    if (assignedFloors.length > 0) {
                        orConditions.push({ floor: { $in: assignedFloors } });
                    }
                    const leases = await Lease.find({ $or: orConditions }).select('_id');
                    const leaseIds = leases.map(l => l._id);
                    query.lease = { $in: leaseIds };
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

        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const Lease = require('../models/Lease');
            const lease = await Lease.findById(tenant.lease);
            if (lease) {
                const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
                const assignedFloors = (req.user.assignedFloors || []).map(id => id.toString());
                const isPropAssigned = assignedProps.includes(lease.property?.toString());
                const isFloorAssigned = assignedFloors.includes(lease.floor?.toString());
                if (!isPropAssigned && !isFloorAssigned) {
                    return res.status(403).json({ success: false, error: 'Not authorized to access this tenant' });
                }
            } else {
                return res.status(403).json({ success: false, error: 'Not authorized to access this tenant' });
            }
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
