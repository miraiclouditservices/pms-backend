const Property  = require('../models/Property');
const Unit      = require('../models/Unit');
const Lease     = require('../models/Lease');
const Floor     = require('../models/Floor');
const Visitor   = require('../models/Visitor');
const Material  = require('../models/Material');
const User      = require('../models/User');

// @desc  Full dashboard metrics
// @route GET /api/dashboard/metrics
exports.getMetrics = async (req, res) => {
    try {
        const now          = new Date();
        const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
        const endOfToday   = new Date(now); endOfToday.setHours(23,59,59,999);
        const todayStr     = now.toISOString().split('T')[0];

        // Scoping filters
        let floorQuery = {}, unitQuery = {}, leaseQuery = { status: 'Active' };
        let visitorQuery = {};
        let materialQuery = {};
        let propertyQuery = {};
        let staffQuery = { role: { $in: ['Staff Admin','Floor Admin','Watchman','Security'] } };

        const isSuperAdmin = ['Super Admin','Admin','Staff Admin'].includes(req.user?.role);

        if (req.user?.role === 'Office Owner' || req.user?.role === 'Owner') {
            const user = await User.findById(req.user.id);
            const assignedUnits = user?.assignedUnits || [];
            
            // Scope units and leases by assignedUnits list
            unitQuery._id = { $in: assignedUnits };
            leaseQuery.units = { $in: assignedUnits };
            
            // Retrieve linked floors and properties
            const units = await Unit.find({ _id: { $in: assignedUnits } });
            const floorIds = units.map(u => u.floor).filter(Boolean);
            floorQuery._id = { $in: floorIds };

            const propertyIds = units.map(u => u.property).filter(Boolean);
            propertyQuery._id = { $in: propertyIds };

            // Scoping visitors and materials
            visitorQuery = {
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id },
                    { personToMeet: { $regex: new RegExp(req.user.name, 'i') } }
                ]
            };

            materialQuery = {
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id }
                ]
            };

            staffQuery.$or = [
                { assignedFloors: { $in: floorIds } },
                { assignedProperties: { $in: propertyIds } }
            ];
        } else if (req.user?.role === 'Floor Admin') {
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds   = floors.map(f => f._id);
            const propertyIds = floors.map(f => f.property).filter(Boolean);

            floorQuery._id  = { $in: fIds };
            unitQuery.floor  = { $in: fIds };
            leaseQuery.floor = { $in: fIds };
            
            visitorQuery.floor = { $in: fIds };
            materialQuery.floor = { $in: fIds };
            propertyQuery._id = { $in: propertyIds };

            staffQuery.$or = [
                { assignedFloors: { $in: fIds } },
                { assignedProperties: { $in: propertyIds } }
            ];
        }

        // ── Core counts ────────────────────────────────────────────────────────
        const [totalProperties, totalFloors, totalUnits, occupiedUnits] = await Promise.all([
            isSuperAdmin ? Property.countDocuments() : Property.countDocuments(propertyQuery),
            Floor.countDocuments(floorQuery),
            Unit.countDocuments(unitQuery),
            Unit.countDocuments({ ...unitQuery, unitStatus: 'Occupied' }),
        ]);

        // ── SFT ────────────────────────────────────────────────────────────────
        const floorRecords = await Floor.find(floorQuery);
        const totalSft    = floorRecords.reduce((s,f) => s+(f.totalSft||0),0);
        const occupiedSft = floorRecords.reduce((s,f) => s+(f.occupiedSft||0),0);
        const availableSft = totalSft - occupiedSft;
        const occupancyPct = totalSft > 0 ? Math.round((occupiedSft/totalSft)*100) : 0;

        // ── Revenue ────────────────────────────────────────────────────────────
        const activeLeases = await Lease.find(leaseQuery);
        const leaseRevenue = activeLeases.reduce((s,l) => s+(l.monthlyRent||0),0);
        const camRevenue   = activeLeases.reduce((s,l) => s+(l.maintenanceCharges||0),0);
        const totalRevenue = leaseRevenue + camRevenue;
        const activeTenantsCount = activeLeases.length;

        // ── Expiring Leases ────────────────────────────────────────────────────
        const in60Days = new Date(now); in60Days.setDate(in60Days.getDate()+60);
        const in10Days = new Date(now); in10Days.setDate(in10Days.getDate()+10);
        const expiringLeasesCount = await Lease.countDocuments({ ...leaseQuery, endDate: { $gte: now, $lte: in60Days } });
        const expiringLeases = await Lease.find({ ...leaseQuery, endDate: { $gte: now, $lte: in60Days } })
            .populate('property','propertyName').sort('endDate').limit(5);

        // ── Visitors ───────────────────────────────────────────────────────────
        const [visitorsToday, visitorsPending, visitorsCheckedIn] = await Promise.all([
            Visitor.countDocuments({ ...visitorQuery, visitDate: todayStr }),
            Visitor.countDocuments({ ...visitorQuery, status: 'Pending' }),
            Visitor.countDocuments({ ...visitorQuery, status: 'Checked-In' }),
        ]);
        const recentVisitors = await Visitor.find(visitorQuery).sort('-createdAt').limit(5)
            .populate('property','propertyName').populate('createdBy','name');

        // ── Gate Passes ────────────────────────────────────────────────────────
        const [gatePassTotal, gatePassPending, gatePassApproved] = await Promise.all([
            Material.countDocuments(materialQuery),
            Material.countDocuments({ ...materialQuery, status: 'Pending' }),
            Material.countDocuments({ ...materialQuery, status: { $in: ['Approved','Cleared'] } }),
        ]);
        const recentGatePasses = await Material.find(materialQuery).sort('-createdAt').limit(5)
            .populate('property','propertyName').populate('createdBy','name');

        // ── Staff ──────────────────────────────────────────────────────────────
        const totalStaff = await User.countDocuments(staffQuery);

        // ── Pending Approvals (visitors + gate passes) ─────────────────────────
        const pendingApprovals = visitorsPending + gatePassPending;

        // ── Monthly revenue trend (last 6 months) ─────────────────────────────
        const monthlyRevenue = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
            const start = new Date(d.getFullYear(), d.getMonth(), 1);
            const end   = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59);
            const leasesInMonth = await Lease.find({ ...leaseQuery, createdAt: { $lte: end }, $or: [{ endDate: { $gte: start }}, { status: 'Active' }] });
            const rev = leasesInMonth.reduce((s,l) => s+(l.monthlyRent||0)+(l.maintenanceCharges||0),0);
            monthlyRevenue.push({ label, revenue: rev });
        }

        // ── Visitor trend (last 7 days) ────────────────────────────────────────
        const visitorTrend = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now); d.setDate(d.getDate()-i);
            const ds = d.toISOString().split('T')[0];
            const count = await Visitor.countDocuments({ ...visitorQuery, visitDate: ds });
            visitorTrend.push({ label: d.toLocaleDateString('default',{weekday:'short'}), count });
        }

        // ── Property occupancy breakdown ───────────────────────────────────────
        const properties = await Property.find(propertyQuery).select('propertyName occupiedSft totalSft occupancyPercentage monthlyRevenue').limit(10);

        return res.status(200).json({
            success: true,
            data: {
                metrics: {
                    totalProperties, totalFloors, totalUnits, occupiedUnits,
                    totalSft, occupiedSft, availableSft, occupancyPct,
                    leaseRevenue, camRevenue, totalRevenue,
                    activeTenantsCount, expiringLeasesCount,
                    visitorsToday, visitorsPending, visitorsCheckedIn,
                    gatePassTotal, gatePassPending, gatePassApproved,
                    totalStaff, pendingApprovals,
                },
                monthlyRevenue,
                visitorTrend,
                propertyBreakdown: properties.map(p => ({
                    name: p.propertyName,
                    occupiedSft: p.occupiedSft || 0,
                    totalSft:    p.totalSft    || 0,
                    pct:         p.occupancyPercentage || 0,
                    revenue:     p.monthlyRevenue || 0,
                })),
                expiringLeasesList: expiringLeases.map(l => ({
                    id: l._id, tenantName: l.tenantName,
                    property: l.property?.propertyName || 'N/A',
                    endDate: l.endDate,
                })),
                recentVisitors: recentVisitors.map(v => ({
                    name: v.visitorName, contact: v.visitorContactNumber,
                    property: v.property?.propertyName || '—',
                    status: v.status, createdBy: v.createdBy?.name || 'Admin',
                    date: v.visitDate,
                })),
                recentGatePasses: recentGatePasses.map(g => ({
                    material: g.materialDetails, type: g.gatePassType,
                    property: g.property?.propertyName || '—',
                    status: g.status, level: g.approvalLevel,
                    createdBy: g.createdBy?.name || 'Admin',
                })),
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
