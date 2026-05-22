const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Lease = require('../models/Lease');
const Helpdesk = require('../models/Helpdesk');
const Visitor = require('../models/Visitor');
const AMC = require('../models/AMC');
const Booking = require('../models/Booking');
const Owner = require('../models/Owner');

// @desc    Get dashboard metrics
// @route   GET /api/dashboard/metrics
// @access  Private
exports.getMetrics = async (req, res, next) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        if (req.user && req.user.role === 'Owner') {
            // Find Owner profile linked to the User
            const owner = await Owner.findOne({ user: req.user._id });
            
            if (!owner) {
                return res.status(200).json({
                    success: true,
                    data: {
                        metrics: {
                            totalProperties: 0,
                            totalUnits: 0,
                            occupiedUnits: 0,
                            vacantUnits: 0,
                            activeLeaseCount: 0,
                            pendingComplaints: 0,
                            visitorsToday: 0,
                            amcExpiryAlerts: 0,
                            upcomingBookings: 0,
                            revenueSummary: 0
                        },
                        recentComplaints: []
                    }
                });
            }

            // Dual-lookup lookup: retrieve units both by owner field on Unit and unitsAssigned array on Owner
            const unitsByOwner = await Unit.find({ owner: owner._id }).populate('property');
            const populatedOwner = await Owner.findById(owner._id).populate({
                path: 'unitsAssigned',
                populate: { path: 'property' }
            });
            const unitsFromProfile = populatedOwner ? (populatedOwner.unitsAssigned || []) : [];

            // Combine and de-duplicate units
            const combinedUnits = [...unitsByOwner, ...unitsFromProfile];
            const uniqueMap = new Map();
            combinedUnits.forEach(u => {
                if (u && u._id) uniqueMap.set(u._id.toString(), u);
            });
            const assignedUnits = Array.from(uniqueMap.values());
            const assignedUnitNumbers = assignedUnits.map(u => u.unitNumber);

            // 1. Total unique properties from units assigned
            const propertyIds = [...new Set(assignedUnits.map(u => (u.property?._id || u.property)?.toString()).filter(Boolean))];
            const totalProperties = propertyIds.length;

            // 2. Total units, occupied, vacant
            const totalUnits = assignedUnits.length;
            const occupiedUnits = assignedUnits.filter(u => u.unitStatus === 'Occupied').length;
            const vacantUnits = assignedUnits.filter(u => u.unitStatus === 'Vacant').length;

            // 3. Active leases owned by this owner
            const activeLeases = await Lease.countDocuments({ owner: owner._id, status: 'Active' });

            // 4. Pending complaints for owner's units or office name
            const pendingComplaints = await Helpdesk.countDocuments({
                $or: [
                    { officeName: owner.ownerName },
                    { unit: { $in: assignedUnitNumbers } }
                ],
                status: { $in: ['Open', 'In Progress'] }
            });

            // 5. Visitors today
            const visitorsToday = await Visitor.countDocuments({
                $or: [
                    { officeName: owner.ownerName },
                    { unit: { $in: assignedUnitNumbers } }
                ],
                createdAt: { $gte: startOfToday }
            });

            // 6. AMC alerts - owners generally do not have system assets AMC, but we filter if any property match
            const amcExpiryAlerts = 0;

            // 7. Upcoming Bookings
            const upcomingBookings = await Booking.countDocuments({
                bookedBy: owner.ownerName,
                date: { $gte: new Date() }
            });

            // 8. Revenue Summary (Sum of active lease rent for this owner)
            const leases = await Lease.find({ owner: owner._id, status: 'Active' });
            const revenueSummary = leases.reduce((sum, l) => sum + (l.monthlyRent || 0), 0);

            // Recent Complaints
            const recentComplaints = await Helpdesk.find({
                $or: [
                    { officeName: owner.ownerName },
                    { unit: { $in: assignedUnitNumbers } }
                ],
                status: { $in: ['Open', 'In Progress'] }
            })
            .sort({ createdAt: -1 })
            .limit(5);

            return res.status(200).json({
                success: true,
                data: {
                    metrics: {
                        totalProperties,
                        totalUnits,
                        occupiedUnits,
                        vacantUnits,
                        activeLeaseCount: activeLeases,
                        pendingComplaints,
                        visitorsToday,
                        amcExpiryAlerts,
                        upcomingBookings,
                        revenueSummary
                    },
                    recentComplaints: recentComplaints.map(c => ({
                        id: c._id.toString(),
                        ticketNumber: c.ticketNumber,
                        natureOfComplaint: c.natureOfComplaint,
                        priority: c.escalated ? 'High' : 'Normal',
                        status: c.status,
                        assigned: c.allocatedTo || 'Unassigned'
                    }))
                }
            });
        }

        // Admin flow
        const totalProperties = await Property.countDocuments();
        const totalUnits = await Unit.countDocuments();
        const occupiedUnits = await Unit.countDocuments({ unitStatus: 'Occupied' });
        const vacantUnits = await Unit.countDocuments({ unitStatus: 'Vacant' });
        
        const activeLeases = await Lease.countDocuments({ status: 'Active' });
        const pendingComplaints = await Helpdesk.countDocuments({ status: { $in: ['Open', 'In Progress'] } });
        
        const visitorsToday = await Visitor.countDocuments({ createdAt: { $gte: startOfToday } });
        
        // AMC Alerts (expiring in next 30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        const amcExpiryAlerts = await AMC.countDocuments({ expiryDate: { $lte: thirtyDaysFromNow, $gte: new Date() } });
        
        const upcomingBookings = await Booking.countDocuments({ date: { $gte: new Date() } });
        
        // Financial & SFT calculations
        const properties = await Property.find();
        const totalPropertySft = properties.reduce((sum, p) => sum + (p.totalSft || 0), 0);
        const occupiedSft = properties.reduce((sum, p) => sum + (p.occupiedSft || 0), 0);
        const availableSft = properties.reduce((sum, p) => sum + (p.availableSft || 0), 0);

        const allLeases = await Lease.find({ status: 'Active' });
        const revenueSummary = allLeases.reduce((sum, l) => sum + (l.monthlyRent || 0), 0);
        const camRevenue = allLeases.reduce((sum, l) => sum + (l.maintenanceCharges || 0), 0);
        const depositAmount = allLeases.reduce((sum, l) => sum + (l.securityDeposit || 0), 0);

        const tenantMap = new Map();
        allLeases.forEach(l => {
            const current = tenantMap.get(l.tenantName) || 0;
            tenantMap.set(l.tenantName, current + (l.allocatedSft || 0));
        });
        const tenantAllocations = Array.from(tenantMap, ([tenantName, allocatedSft]) => ({ tenantName, allocatedSft }));

        // Get recent complaints
        const recentComplaints = await Helpdesk.find({ status: { $in: ['Open', 'In Progress'] } })
            .sort({ createdAt: -1 })
            .limit(5);

        res.status(200).json({
            success: true,
            data: {
                metrics: {
                    totalProperties,
                    totalUnits,
                    occupiedUnits,
                    vacantUnits,
                    activeLeaseCount: activeLeases,
                    pendingComplaints,
                    visitorsToday,
                    amcExpiryAlerts,
                    upcomingBookings,
                    revenueSummary,
                    totalPropertySft,
                    occupiedSft,
                    availableSft,
                    camRevenue,
                    depositAmount
                },
                tenantAllocations,
                recentComplaints: recentComplaints.map(c => ({
                    id: c._id.toString(),
                    ticketNumber: c.ticketNumber,
                    natureOfComplaint: c.natureOfComplaint,
                    priority: c.escalated ? 'High' : 'Normal',
                    status: c.status,
                    assigned: c.allocatedTo || 'Unassigned'
                }))
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
