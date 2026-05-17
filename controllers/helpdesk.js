const Helpdesk = require('../models/Helpdesk');
const factory = require('./factory');

exports.getTickets = factory.getAll(Helpdesk);
exports.getTicket = factory.getOne(Helpdesk);
exports.createTicket = factory.createOne(Helpdesk);
exports.updateTicket = factory.updateOne(Helpdesk);
exports.deleteTicket = factory.deleteOne(Helpdesk);

exports.getHelpdeskStats = async (req, res, next) => {
    try {
        let matchQuery = {};

        // If Owner, apply strict data isolation filters to stats aggregation
        if (req.user && req.user.role === 'Owner') {
            const Owner = require('../models/Owner');
            const owner = await Owner.findOne({ user: req.user._id }).populate('unitsAssigned');
            
            if (!owner) {
                return res.status(200).json({
                    success: true,
                    data: { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 }
                });
            }

            const assignedUnits = owner.unitsAssigned || [];
            const assignedUnitNumbers = assignedUnits.map(u => u.unitNumber);

            matchQuery.$or = [
                { officeName: owner.ownerName },
                { unit: { $in: assignedUnitNumbers } }
            ];
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
