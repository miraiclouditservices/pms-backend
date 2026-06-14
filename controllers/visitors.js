const Visitor      = require('../models/Visitor');
const Property     = require('../models/Property');
const Floor        = require('../models/Floor');
const Unit         = require('../models/Unit');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const factory      = require('./factory');

// ── Populate config ───────────────────────────────────────────────────────────
const POPULATE = [
    { path: 'property', select: 'propertyName propertyAddress propertyType' },
    {
        path: 'floor',
        select: 'floorNumber floorName totalUnits assignedAdmin assignedOwner',
        populate: [
            { path: 'assignedAdmin',  select: 'name email phone role' },
            { path: 'assignedOwner', select: 'ownerName contactNumber emailId' },
        ]
    },
    {
        path: 'unit',
        select: 'unitNumber unitType unitStatus sqft ownerName owner',
        populate: { path: 'owner', select: 'ownerName contactNumber emailId designation' }
    },
    { path: 'createdBy',  select: 'name email phone role' },
    { path: 'approvedBy', select: 'name email phone role' },
];

// ── Get All Visitors (fully populated) ───────────────────────────────────────
exports.getVisitors = async (req, res) => {
    try {
        let query = {};

        if (req.user && (req.user.role === 'Owner' || req.user.role === 'OFFICE_OWNER')) {
            const user = await User.findById(req.user.id);
            const assignedUnits = user?.assignedUnits || [];
            
            query = {
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id },
                    { personToMeet: { $regex: new RegExp(req.user.name, 'i') } }
                ]
            };
        } else if (req.user && req.user.role === 'FLOOR_ADMIN') {
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds = floors.map(f => f._id);
            query = { floor: { $in: fIds } };
        } else if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = req.user.assignedProperties || [];
            const assignedFloors = req.user.assignedFloors || [];
            if (assignedProps.length === 0 && assignedFloors.length === 0) {
                query = { _id: null };
            } else {
                query.$or = [];
                if (assignedProps.length > 0) {
                    query.$or.push({ property: { $in: assignedProps } });
                }
                if (assignedFloors.length > 0) {
                    query.$or.push({ floor: { $in: assignedFloors } });
                }
            }
        }

        // Apply filters
        const andConditions = [];
        if (Object.keys(query).length > 0) {
            andConditions.push(query);
        }

        // Date Filter
        if (req.query.dateFilter) {
            const todayStr = new Date().toISOString().split('T')[0];
            if (req.query.dateFilter === 'Today') {
                andConditions.push({ visitDate: todayStr });
            } else if (req.query.dateFilter === 'Yesterday') {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                andConditions.push({ visitDate: yesterdayStr });
            } else if (req.query.dateFilter !== 'Select Date' && req.query.dateFilter !== '') {
                andConditions.push({ visitDate: req.query.dateFilter });
            }
        }

        // Status Filter
        if (req.query.status && req.query.status !== 'Visit Status: All' && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }

        // Purpose Filter
        if (req.query.purpose && req.query.purpose !== 'Purpose: All' && req.query.purpose !== 'All') {
            andConditions.push({ purposeOfVisit: req.query.purpose });
        }

        // Search Filter
        if (req.query.search) {
            const regex = new RegExp(req.query.search, 'i');
            andConditions.push({
                $or: [
                    { visitorName: regex },
                    { visitorContactNumber: regex },
                    { purposeOfVisit: regex },
                    { personToMeet: regex }
                ]
            });
        }

        const finalQuery = andConditions.length > 0 ? { $and: andConditions } : {};

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;

        const total = await Visitor.countDocuments(finalQuery);

        const visitors = await Visitor.find(finalQuery)
            .populate(POPULATE)
            .sort({ createdAt: -1 })
            .skip(startIndex)
            .limit(limit);

        res.status(200).json({ 
            success: true, 
            count: visitors.length,
            total,
            page,
            pages: Math.ceil(total / limit) || 1,
            data: visitors 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Get Single Visitor (fully populated) ─────────────────────────────────────
exports.getVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findById(req.params.id).populate(POPULATE);
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
        
        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
            const assignedFloors = (req.user.assignedFloors || []).map(id => id.toString());
            const isPropAssigned = assignedProps.includes(visitor.property?._id?.toString() || visitor.property?.toString());
            const isFloorAssigned = assignedFloors.includes(visitor.floor?._id?.toString() || visitor.floor?.toString());
            if (!isPropAssigned && !isFloorAssigned) {
                return res.status(403).json({ success: false, message: 'Not authorized to access this visitor record' });
            }
        }
        res.status(200).json({ success: true, data: visitor });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Create Visitor with hierarchy-based notification ─────────────────────────
exports.createVisitor = async (req, res) => {
    try {
        const { property: propertyId, floor: floorId, unit: unitId, ...rest } = req.body;

        // Auto-resolve approval level
        let approvalLevel = 'Property Level';
        if (unitId)       approvalLevel = 'Office Level';
        else if (floorId) approvalLevel = 'Floor Level';

        const visitor = await Visitor.create({
            ...rest,
            property:     propertyId || undefined,
            floor:        floorId    || undefined,
            unit:         unitId     || undefined,
            approvalLevel,
            createdBy:    req.user?._id,
            status:       'Checked-In',
        });

        // ── Fire targeted notification ────────────────────────────────────────
        try {
            let recipientIds = [];
            let authorityLabel = '';

            if (approvalLevel === 'Office Level' && unitId) {
                const unit = await Unit.findById(unitId).populate('owner');
                if (unit?.owner?.user) { recipientIds = [unit.owner.user]; authorityLabel = `OFFICE_OWNER`; }

            } else if (approvalLevel === 'Floor Level' && floorId) {
                const floor = await Floor.findById(floorId);
                if (floor?.assignedAdmin)  { recipientIds = [floor.assignedAdmin]; authorityLabel = `FLOOR_ADMIN (Floor ${floor.floorNumber})`; }
                else if (floor?.assignedOwner) {
                    const owner = await require('../models/Owner').findById(floor.assignedOwner);
                    if (owner?.user) { recipientIds = [owner.user]; authorityLabel = `Floor Owner`; }
                }

            } else if (approvalLevel === 'Property Level' && propertyId) {
                const property = await Property.findById(propertyId);
                if (property?.createdBy) { recipientIds = [property.createdBy]; authorityLabel = `Property Owner`; }
            }

            // Fallback → all SUPER_ADMINs
            if (!recipientIds.length) {
                const admins = await User.find({ role: 'SUPER_ADMIN' }).select('_id');
                recipientIds = admins.map(a => a._id);
                authorityLabel = 'Admin';
            }

            const notifMsg = `Visitor "${visitor.visitorName}" has checked in to meet "${visitor.personToMeet || '—'}".`;

            for (const uid of recipientIds) {
                await Notification.create({
                    user: uid,
                    title: 'New Visitor Notification',
                    message: notifMsg,
                    type: 'Alert',
                });
            }

            // Notify Watchman/Security
            const watchmen = await User.find({ role: { $in: ['Watchman', 'Security'] } }).select('_id');
            for (const w of watchmen) {
                await Notification.create({
                    user: w._id,
                    title: 'Visitor Registered — Checked In',
                    message: `Visitor "${visitor.visitorName}" (${visitor.visitorContactNumber}) has checked in to meet "${visitor.personToMeet || '—'}".`,
                    type: 'Alert',
                });
            }
        } catch (notifErr) {
            console.error('Notification error:', notifErr.message);
        }

        res.status(201).json({ success: true, data: visitor });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.updateVisitor = factory.updateOne(Visitor);
exports.deleteVisitor = factory.deleteOne(Visitor);

// ── Check-In (Watchman) ───────────────────────────────────────────────────────
exports.checkInVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findById(req.params.id);
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
        if (visitor.status !== 'Pending')
            return res.status(400).json({ success: false, message: 'Visitor is not pending check-in (already checked in or checked out)' });

        visitor.status = 'Checked-In';
        visitor.inTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        await visitor.save();

        // ── Fire check-in notification ────────────────────────────────────────
        try {
            let recipientIds = [];
            const approvalLevel = visitor.approvalLevel;
            const unitId = visitor.unit;
            const floorId = visitor.floor;
            const propertyId = visitor.property;

            if (approvalLevel === 'Office Level' && unitId) {
                const unit = await Unit.findById(unitId).populate('owner');
                if (unit?.owner?.user) recipientIds = [unit.owner.user];
            } else if (approvalLevel === 'Floor Level' && floorId) {
                const floor = await Floor.findById(floorId);
                if (floor?.assignedAdmin) recipientIds = [floor.assignedAdmin];
                else if (floor?.assignedOwner) {
                    const owner = await require('../models/Owner').findById(floor.assignedOwner);
                    if (owner?.user) recipientIds = [owner.user];
                }
            } else if (approvalLevel === 'Property Level' && propertyId) {
                const property = await Property.findById(propertyId);
                if (property?.createdBy) recipientIds = [property.createdBy];
            }

            if (!recipientIds.length) {
                const admins = await User.find({ role: 'SUPER_ADMIN' }).select('_id');
                recipientIds = admins.map(a => a._id);
            }

            const checkInMsg = `Visitor "${visitor.visitorName}" has checked in to meet "${visitor.personToMeet || '—'}".`;

            for (const uid of recipientIds) {
                await Notification.create({
                    user: uid,
                    title: 'Visitor Checked In',
                    message: checkInMsg,
                    type: 'Alert',
                });
            }
        } catch (notifErr) {
            console.error('Check-in notification error:', notifErr.message);
        }

        res.status(200).json({ success: true, data: visitor });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Check-Out (Watchman) ──────────────────────────────────────────────────────
exports.checkOutVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findById(req.params.id);
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
        if (visitor.status === 'Checked-Out')
            return res.status(400).json({ success: false, message: 'Visitor is already checked out' });

        visitor.status  = 'Checked-Out';
        visitor.outTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        visitor.outDate = new Date().toISOString().split('T')[0];
        if (req.user) {
            visitor.approvedBy = req.user._id;
        }
        await visitor.save();
        const populated = await Visitor.findById(visitor._id).populate(POPULATE);
        res.status(200).json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Dashboard Stats ───────────────────────────────────────────────────────────
exports.getVisitorStats = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        let query = {};

        if (req.user && (req.user.role === 'Owner' || req.user.role === 'OFFICE_OWNER')) {
            const user = await User.findById(req.user.id);
            const assignedUnits = user?.assignedUnits || [];
            
            query = {
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id },
                    { personToMeet: { $regex: new RegExp(req.user.name, 'i') } }
                ]
            };
        } else if (req.user && req.user.role === 'FLOOR_ADMIN') {
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds = floors.map(f => f._id);
            query = { floor: { $in: fIds } };
        } else if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = req.user.assignedProperties || [];
            const assignedFloors = req.user.assignedFloors || [];
            if (assignedProps.length === 0 && assignedFloors.length === 0) {
                query = { _id: null };
            } else {
                query.$or = [];
                if (assignedProps.length > 0) {
                    query.$or.push({ property: { $in: assignedProps } });
                }
                if (assignedFloors.length > 0) {
                    query.$or.push({ floor: { $in: assignedFloors } });
                }
            }
        }

        const [total, todayCount, checkedIn, checkedOut] = await Promise.all([
            Visitor.countDocuments(query),
            Visitor.countDocuments({ ...query, visitDate: today }),
            Visitor.countDocuments({ ...query, status: 'Checked-In' }),
            Visitor.countDocuments({ ...query, status: 'Checked-Out', visitDate: today }),
        ]);
        res.status(200).json({ 
            success: true, 
            data: { 
                total, 
                todayCount, 
                pending: 0, 
                approved: 0, 
                checkedIn, 
                checkedOut, 
                rejected: 0 
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
