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

        const { propertyId, month, year, status } = req.query;

        // Scoping filters
        let floorQuery = {}, unitQuery = {}, leaseQuery = {};
        let visitorQuery = {};
        let materialQuery = {};
        let propertyQuery = {};
        let staffQuery = { role: { $in: ['STAFF_ADMIN','FLOOR_ADMIN','Watchman','Security'] } };

        // 1. Property Filter
        if (propertyId) {
            propertyQuery._id = propertyId;
            floorQuery.property = propertyId;
            unitQuery.property = propertyId;
            leaseQuery.property = propertyId;
            visitorQuery.property = propertyId;
            materialQuery.property = propertyId;
            staffQuery.assignedProperties = propertyId;
        }

        // 2. Month & Year Filter
        if (month || year) {
            const y = year ? parseInt(year, 10) : now.getFullYear();
            const m = month ? parseInt(month, 10) - 1 : now.getMonth();
            const firstDayOfMonth = new Date(y, m, 1, 0, 0, 0, 0);
            const lastDayOfMonth  = new Date(y, m + 1, 0, 23, 59, 59, 999);
            
            // Leases active in that month range
            leaseQuery.startDate = { $lte: lastDayOfMonth };
            leaseQuery.endDate = { $gte: firstDayOfMonth };

            // Visitors in that month
            const startStr = firstDayOfMonth.toISOString().split('T')[0];
            const endStr = lastDayOfMonth.toISOString().split('T')[0];
            visitorQuery.visitDate = { $gte: startStr, $lte: endStr };

            // Materials in that month
            materialQuery.createdAt = { $gte: firstDayOfMonth, $lte: lastDayOfMonth };
        }

        // 3. Status Filter
        if (status && status !== 'All') {
            if (status === 'Active') {
                leaseQuery.status = 'Active';
                unitQuery.unitStatus = 'Occupied';
            } else if (status === 'Occupied') {
                unitQuery.unitStatus = 'Occupied';
                leaseQuery.status = 'Active';
            } else if (status === 'Vacant') {
                unitQuery.unitStatus = 'Available';
            } else if (status === 'Pending') {
                visitorQuery.status = 'Pending';
                materialQuery.status = 'Pending';
            } else if (status === 'Expired') {
                leaseQuery.status = 'Expired';
            } else if (status === 'Maintenance') {
                unitQuery.unitStatus = 'Maintenance';
            }
        } else {
            // Default active lease status if not filtered otherwise
            if (!leaseQuery.status) {
                if (month || year) {
                    leaseQuery.status = { $in: ['Active', 'Expired'] };
                } else {
                    leaseQuery.status = 'Active';
                }
            }
        }

        const isSuperAdmin = ['SUPER_ADMIN','Admin'].includes(req.user?.role);

        if (req.user?.role === 'OFFICE_OWNER' || req.user?.role === 'Owner') {
            const user = await User.findById(req.user.id);
            const assignedUnits = user?.assignedUnits || [];
            
            unitQuery._id = unitQuery._id ? { $and: [unitQuery._id, { $in: assignedUnits }] } : { $in: assignedUnits };
            leaseQuery.units = leaseQuery.units ? { $and: [leaseQuery.units, { $in: assignedUnits }] } : { $in: assignedUnits };
            
            const units = await Unit.find({ _id: { $in: assignedUnits } });
            const floorIds = units.map(u => u.floor).filter(Boolean);
            floorQuery._id = floorQuery._id ? { $and: [floorQuery._id, { $in: floorIds }] } : { $in: floorIds };

            const propertyIds = units.map(u => u.property).filter(Boolean);
            propertyQuery._id = propertyQuery._id ? { $and: [propertyQuery._id, { $in: propertyIds }] } : { $in: propertyIds };

            visitorQuery = {
                ...visitorQuery,
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id },
                    { personToMeet: { $regex: new RegExp(req.user.name, 'i') } }
                ]
            };

            materialQuery = {
                ...materialQuery,
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id }
                ]
            };

            staffQuery.$or = [
                { assignedFloors: { $in: floorIds } },
                { assignedProperties: { $in: propertyIds } }
            ];
        } else if (req.user?.role === 'FLOOR_ADMIN') {
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds   = floors.map(f => f._id);
            const propertyIds = floors.map(f => f.property).filter(Boolean);

            floorQuery._id = floorQuery._id ? { $and: [floorQuery._id, { $in: fIds }] } : { $in: fIds };
            unitQuery.floor = unitQuery.floor ? { $and: [unitQuery.floor, { $in: fIds }] } : { $in: fIds };
            leaseQuery.floor = leaseQuery.floor ? { $and: [leaseQuery.floor, { $in: fIds }] } : { $in: fIds };
            
            visitorQuery.floor = visitorQuery.floor ? { $and: [visitorQuery.floor, { $in: fIds }] } : { $in: fIds };
            materialQuery.floor = materialQuery.floor ? { $and: [materialQuery.floor, { $in: fIds }] } : { $in: fIds };
            propertyQuery._id = propertyQuery._id ? { $and: [propertyQuery._id, { $in: propertyIds }] } : { $in: propertyIds };

            staffQuery.$or = [
                { assignedFloors: { $in: fIds } },
                { assignedProperties: { $in: propertyIds } }
            ];
        } else if (req.user?.role === 'STAFF_ADMIN') {
            const assignedProps = req.user.assignedProperties || [];
            const assignedFloors = req.user.assignedFloors || [];
            
            if (assignedProps.length === 0 && assignedFloors.length === 0) {
                propertyQuery._id = { $in: [] };
                floorQuery._id = { $in: [] };
                unitQuery._id = { $in: [] };
                leaseQuery._id = { $in: [] };
                visitorQuery._id = { $in: [] };
                materialQuery._id = { $in: [] };
                staffQuery._id = { $in: [] };
            } else {
                const allowedPropIds = [...assignedProps.map(id => id.toString())];
                if (assignedFloors.length > 0) {
                    const floors = await Floor.find({ _id: { $in: assignedFloors } });
                    allowedPropIds.push(...floors.map(f => f.property.toString()));
                }
                const uniqueProps = [...new Set(allowedPropIds)];

                propertyQuery._id = propertyQuery._id 
                    ? { $and: [propertyQuery._id, { $in: uniqueProps }] } 
                    : { $in: uniqueProps };

                const floorOrConditions = [];
                if (assignedProps.length > 0) {
                    floorOrConditions.push({ property: { $in: assignedProps } });
                }
                if (assignedFloors.length > 0) {
                    floorOrConditions.push({ _id: { $in: assignedFloors } });
                }
                
                const staffOrConditions = [];
                if (assignedProps.length > 0) staffOrConditions.push({ assignedProperties: { $in: assignedProps } });
                if (assignedFloors.length > 0) staffOrConditions.push({ assignedFloors: { $in: assignedFloors } });

                floorQuery = { $and: [floorQuery, { $or: floorOrConditions }] };
                
                const spaceOrConditions = [];
                if (assignedProps.length > 0) spaceOrConditions.push({ property: { $in: assignedProps } });
                if (assignedFloors.length > 0) spaceOrConditions.push({ floor: { $in: assignedFloors } });

                unitQuery = { $and: [unitQuery, { $or: spaceOrConditions }] };
                leaseQuery = { $and: [leaseQuery, { $or: spaceOrConditions }] };
                visitorQuery = { $and: [visitorQuery, { $or: spaceOrConditions }] };
                materialQuery = { $and: [materialQuery, { $or: spaceOrConditions }] };
                staffQuery = { $and: [staffQuery, { $or: staffOrConditions }] };
            }
        }

        // ── Core counts ────────────────────────────────────────────────────────
        // ── Core counts ────────────────────────────────────────────────────────
        let occupiedUnitsQuery = { ...unitQuery };
        if (!occupiedUnitsQuery.unitStatus) {
            occupiedUnitsQuery.unitStatus = 'Occupied';
        } else if (occupiedUnitsQuery.unitStatus !== 'Occupied') {
            occupiedUnitsQuery = { _id: null };
        }

        const [totalProperties, totalFloors, totalUnits, occupiedUnits] = await Promise.all([
            Property.countDocuments(propertyQuery),
            Floor.countDocuments(floorQuery),
            Unit.countDocuments(unitQuery),
            Unit.countDocuments(occupiedUnitsQuery),
        ]);

        // ── SFT ────────────────────────────────────────────────────────────────
        const floorRecords = await Floor.find(floorQuery);
        const totalSft    = floorRecords.reduce((s,f) => s+(f.totalSft||0),0);
        const occupiedSft = floorRecords.reduce((s,f) => s+(f.occupiedSft||0),0);
        
        let calculatedOccupiedSft = occupiedSft;
        let calculatedAvailableSft = totalSft - occupiedSft;
        
        if (status === 'Occupied' || status === 'Active') {
            calculatedAvailableSft = 0;
        } else if (status === 'Vacant') {
            calculatedOccupiedSft = 0;
            calculatedAvailableSft = totalSft;
        } else if (status === 'Maintenance') {
            calculatedOccupiedSft = 0;
            calculatedAvailableSft = 0;
        }
        
        const occupancyPct = totalSft > 0 ? Math.round((calculatedOccupiedSft/totalSft)*100) : 0;

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
        let visitorsCheckedInQuery = { ...visitorQuery };
        if (!visitorsCheckedInQuery.status) {
            visitorsCheckedInQuery.status = 'Checked-In';
        } else if (visitorsCheckedInQuery.status !== 'Checked-In') {
            visitorsCheckedInQuery = { _id: null };
        }

        const [visitorsToday, visitorsPending, visitorsCheckedIn] = await Promise.all([
            Visitor.countDocuments({ ...visitorQuery, visitDate: todayStr }),
            Visitor.countDocuments({ ...visitorQuery, status: 'Pending' }),
            Visitor.countDocuments(visitorsCheckedInQuery),
        ]);
        const recentVisitors = await Visitor.find(visitorQuery).sort('-createdAt').limit(5)
            .populate('property','propertyName').populate('createdBy','name');

        // ── Gate Passes ────────────────────────────────────────────────────────
        let gatePassPendingQuery = { ...materialQuery };
        if (!gatePassPendingQuery.status) {
            gatePassPendingQuery.status = 'Pending';
        } else if (gatePassPendingQuery.status !== 'Pending') {
            gatePassPendingQuery = { _id: null };
        }

        let gatePassApprovedQuery = { ...materialQuery };
        if (!gatePassApprovedQuery.status) {
            gatePassApprovedQuery.status = { $in: ['Approved', 'Cleared'] };
        } else if (typeof gatePassApprovedQuery.status === 'string' && !['Approved', 'Cleared'].includes(gatePassApprovedQuery.status)) {
            gatePassApprovedQuery = { _id: null };
        }

        const [gatePassTotal, gatePassPending, gatePassApproved] = await Promise.all([
            Material.countDocuments(materialQuery),
            Material.countDocuments(gatePassPendingQuery),
            Material.countDocuments(gatePassApprovedQuery),
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
                    totalSft, occupiedSft: calculatedOccupiedSft, availableSft: calculatedAvailableSft, occupancyPct,
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
