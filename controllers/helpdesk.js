const Helpdesk = require('../models/Helpdesk');
const factory = require('./factory');

exports.getTickets = async (req, res, next) => {
    try {
        let query = {};
        
        if (req.user) {
            if (req.user.role === 'Tenant') {
                const tenant = await require('mongoose').model('Tenant').findOne({ user: req.user._id });
                if (!tenant) return res.status(200).json({ success: true, count: 0, data: [] });
                query.tenant = tenant._id;
            } else if (req.user.role === 'Owner' || req.user.role === 'Office Owner') {
                const user = await require('../models/User').findById(req.user.id);
                const assignedUnits = user?.assignedUnits || [];
                
                // Find all leases belonging to the assigned units
                const Lease = require('../models/Lease');
                const leases = await Lease.find({ units: { $in: assignedUnits } });
                const leaseIds = leases.map(l => l._id);
                
                // Find all tenants belonging to those leases or linked to the owner user
                const Tenant = require('../models/Tenant');
                const tenants = await Tenant.find({
                    $or: [
                        { lease: { $in: leaseIds } },
                        { user: req.user._id }
                    ]
                });
                const tenantIds = tenants.map(t => t._id);
                
                query = {
                    $or: [
                        { tenant: { $in: tenantIds } },
                        { createdBy: req.user._id }
                    ]
                };
            } else if (req.user.role === 'Floor Admin') {
                const Floor = require('../models/Floor');
                const Lease = require('../models/Lease');
                const Tenant = require('../models/Tenant');
                
                const floors = await Floor.find({ assignedAdmin: req.user._id });
                const fIds = floors.map(f => f._id);
                const leases = await Lease.find({ floor: { $in: fIds } });
                const leaseIds = leases.map(l => l._id);
                const tenants = await Tenant.find({ lease: { $in: leaseIds } });
                const tenantIds = tenants.map(t => t._id);
                
                query.tenant = { $in: tenantIds };
            }
        }

        const tickets = await Helpdesk.find(query)
            .populate({
                path: 'tenant',
                populate: { path: 'lease', populate: { path: 'units' } }
            })
            .sort('-createdAt');
            
        res.status(200).json({ success: true, count: tickets.length, data: tickets });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createTicket = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Tenant') {
            const tenant = await require('mongoose').model('Tenant').findOne({ user: req.user._id });
            if (!tenant) return res.status(403).json({ success: false, error: 'Tenant profile not found' });
            req.body.tenant = tenant._id;
        }
        
        const ticket = await Helpdesk.create(req.body);
        res.status(201).json({ success: true, data: ticket });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.getTicket = factory.getOne(Helpdesk);
exports.updateTicket = factory.updateOne(Helpdesk);
exports.deleteTicket = factory.deleteOne(Helpdesk);

exports.getHelpdeskStats = async (req, res, next) => {
    try {
        let matchQuery = {};

        if (req.user) {
            if (req.user.role === 'Tenant') {
                const tenant = await require('mongoose').model('Tenant').findOne({ user: req.user._id });
                if (!tenant) return res.status(200).json({ success: true, data: { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 } });
                matchQuery.tenant = tenant._id;
            } else if (req.user.role === 'Owner' || req.user.role === 'Office Owner') {
                const user = await require('../models/User').findById(req.user.id);
                const assignedUnits = user?.assignedUnits || [];
                const Lease = require('../models/Lease');
                const leases = await Lease.find({ units: { $in: assignedUnits } });
                const leaseIds = leases.map(l => l._id);
                const Tenant = require('../models/Tenant');
                const tenants = await Tenant.find({
                    $or: [
                        { lease: { $in: leaseIds } },
                        { user: req.user._id }
                    ]
                });
                const tenantIds = tenants.map(t => t._id);
                matchQuery.tenant = { $in: tenantIds };
            } else if (req.user.role === 'Floor Admin') {
                const Floor = require('../models/Floor');
                const Lease = require('../models/Lease');
                const Tenant = require('../models/Tenant');
                const floors = await Floor.find({ assignedAdmin: req.user._id });
                const fIds = floors.map(f => f._id);
                const leases = await Lease.find({ floor: { $in: fIds } });
                const leaseIds = leases.map(l => l._id);
                const tenants = await Tenant.find({ lease: { $in: leaseIds } });
                const tenantIds = tenants.map(t => t._id);
                matchQuery.tenant = { $in: tenantIds };
            }
        }

        const stats = await Helpdesk.aggregate([
            { $match: matchQuery },
            {
                $facet: {
                    total: [{ $count: "count" }],
                    open: [
                        { $match: { status: "Open" } },
                        { $count: "count" }
                    ],
                    inProgress: [
                        { $match: { status: "In Progress" } },
                        { $count: "count" }
                    ],
                    resolved: [
                        { $match: { status: "Resolved" } },
                        { $count: "count" }
                    ],
                    closed: [
                        { $match: { status: "Closed" } },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const result = {
            total: stats[0].total[0]?.count || 0,
            open: stats[0].open[0]?.count || 0,
            inProgress: stats[0].inProgress[0]?.count || 0,
            resolved: stats[0].resolved[0]?.count || 0,
            closed: stats[0].closed[0]?.count || 0
        };

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};
