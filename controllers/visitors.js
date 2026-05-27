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

        if (req.user && (req.user.role === 'Owner' || req.user.role === 'Office Owner')) {
            const user = await User.findById(req.user.id);
            const assignedUnits = user?.assignedUnits || [];
            
            query = {
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id },
                    { personToMeet: { $regex: new RegExp(req.user.name, 'i') } }
                ]
            };
        } else if (req.user && req.user.role === 'Floor Admin') {
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds = floors.map(f => f._id);
            query = { floor: { $in: fIds } };
        }

        const visitors = await Visitor.find(query)
            .populate(POPULATE)
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: visitors.length, data: visitors });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Get Single Visitor (fully populated) ─────────────────────────────────────
exports.getVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findById(req.params.id).populate(POPULATE);
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
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

        // Office Owner creates visitor → auto-approve
        const isOfficeOwner = req.user?.role === 'Office Owner';
        const autoApprove   = isOfficeOwner && !!unitId;

        const visitor = await Visitor.create({
            ...rest,
            property:     propertyId || undefined,
            floor:        floorId    || undefined,
            unit:         unitId     || undefined,
            approvalLevel,
            createdBy:    req.user?._id,
            status:       autoApprove ? 'Approved' : 'Pending',
            ...(autoApprove ? { approvedBy: req.user._id, approvedAt: new Date() } : {}),
        });

        // ── Fire targeted notification ────────────────────────────────────────
        try {
            let recipientIds = [];
            let authorityLabel = '';

            if (approvalLevel === 'Office Level' && unitId) {
                const unit = await Unit.findById(unitId).populate('owner');
                if (unit?.owner?.user) { recipientIds = [unit.owner.user]; authorityLabel = `Office Owner`; }

            } else if (approvalLevel === 'Floor Level' && floorId) {
                const floor = await Floor.findById(floorId);
                if (floor?.assignedAdmin)  { recipientIds = [floor.assignedAdmin]; authorityLabel = `Floor Admin (Floor ${floor.floorNumber})`; }
                else if (floor?.assignedOwner) {
                    const owner = await require('../models/Owner').findById(floor.assignedOwner);
                    if (owner?.user) { recipientIds = [owner.user]; authorityLabel = `Floor Owner`; }
                }

            } else if (approvalLevel === 'Property Level' && propertyId) {
                const property = await Property.findById(propertyId);
                if (property?.createdBy) { recipientIds = [property.createdBy]; authorityLabel = `Property Owner`; }
            }

            // Fallback → all Super Admins
            if (!recipientIds.length) {
                const admins = await User.find({ role: 'Super Admin' }).select('_id');
                recipientIds = admins.map(a => a._id);
                authorityLabel = 'Admin';
            }

            const notifMsg = autoApprove
                ? `Visitor "${visitor.visitorName}" was auto-approved for office entry. Security has been notified.`
                : `New visitor "${visitor.visitorName}" is awaiting your approval (${approvalLevel}).`;

            for (const uid of recipientIds) {
                await Notification.create({
                    user: uid,
                    title: autoApprove ? 'Visitor Entry Notification' : 'Visitor Approval Required',
                    message: notifMsg,
                    type: 'Alert',
                });
            }

            // If auto-approved → also notify Watchman/Security
            if (autoApprove) {
                const watchmen = await User.find({ role: { $in: ['Watchman', 'Security'] } }).select('_id');
                for (const w of watchmen) {
                    await Notification.create({
                        user: w._id,
                        title: '✅ Visitor Approved — Allow Entry',
                        message: `Visitor "${visitor.visitorName}" (${visitor.visitorContactNumber}) has been approved for entry. Please allow access and capture In-Time.`,
                        type: 'Alert',
                    });
                }
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

// ── Approve Visitor ───────────────────────────────────────────────────────────
exports.approveVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findByIdAndUpdate(
            req.params.id,
            { status: 'Approved', approvedBy: req.user._id, approvedAt: new Date() },
            { new: true, runValidators: true }
        );
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });

        // Notify Watchman/Security
        try {
            const watchmen = await User.find({ role: { $in: ['Watchman', 'Security'] } }).select('_id');
            for (const w of watchmen) {
                await Notification.create({
                    user: w._id,
                    title: '✅ Visitor Approved — Allow Entry',
                    message: `Visitor "${visitor.visitorName}" (${visitor.visitorContactNumber}) has been approved. Please allow access and capture In-Time.`,
                    type: 'Alert',
                });
            }
        } catch (e) { console.error('Watchman notify error:', e.message); }

        res.status(200).json({ success: true, data: visitor });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Reject Visitor ────────────────────────────────────────────────────────────
exports.rejectVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findByIdAndUpdate(
            req.params.id,
            { status: 'Rejected', rejectionReason: req.body.reason || 'Rejected by admin' },
            { new: true, runValidators: true }
        );
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
        res.status(200).json({ success: true, data: visitor });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Check-In (Watchman) ───────────────────────────────────────────────────────
exports.checkInVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findById(req.params.id);
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
        if (visitor.status !== 'Approved')
            return res.status(400).json({ success: false, message: 'Visitor must be approved before check-in' });

        visitor.status = 'Checked-In';
        visitor.inTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        await visitor.save();
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
        if (visitor.status !== 'Checked-In')
            return res.status(400).json({ success: false, message: 'Visitor is not currently checked in' });

        visitor.status  = 'Checked-Out';
        visitor.outTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        await visitor.save();
        res.status(200).json({ success: true, data: visitor });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Dashboard Stats ───────────────────────────────────────────────────────────
exports.getVisitorStats = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        let query = {};

        if (req.user && (req.user.role === 'Owner' || req.user.role === 'Office Owner')) {
            const user = await User.findById(req.user.id);
            const assignedUnits = user?.assignedUnits || [];
            
            query = {
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id },
                    { personToMeet: { $regex: new RegExp(req.user.name, 'i') } }
                ]
            };
        } else if (req.user && req.user.role === 'Floor Admin') {
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds = floors.map(f => f._id);
            query = { floor: { $in: fIds } };
        }

        const [total, todayCount, pending, approved, checkedIn, checkedOut, rejected] = await Promise.all([
            Visitor.countDocuments(query),
            Visitor.countDocuments({ ...query, visitDate: today }),
            Visitor.countDocuments({ ...query, status: 'Pending' }),
            Visitor.countDocuments({ ...query, status: 'Approved' }),
            Visitor.countDocuments({ ...query, status: 'Checked-In' }),
            Visitor.countDocuments({ ...query, status: 'Checked-Out', visitDate: today }),
            Visitor.countDocuments({ ...query, status: 'Rejected' }),
        ]);
        res.status(200).json({ success: true, data: { total, todayCount, pending, approved, checkedIn, checkedOut, rejected } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
