const Material     = require('../models/Material');
const Property     = require('../models/Property');
const Floor        = require('../models/Floor');
const Unit         = require('../models/Unit');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const factory      = require('./factory');

const POPULATE = [
    { path: 'property', select: 'propertyName propertyAddress propertyType' },
    {
        path: 'floor',
        select: 'floorNumber floorName totalUnits totalSft assignedAdmin assignedOwner',
        populate: [
            { path: 'assignedAdmin', select: 'name email phone role' },
            { path: 'assignedOwner', select: 'ownerName contactNumber alternateNumber emailId contactPerson designation' },
        ]
    },
    {
        path: 'unit',
        select: 'unitNumber unitType unitStatus sqft ownerName owner',
        populate: { path: 'owner', select: 'ownerName contactNumber alternateNumber emailId contactPerson designation ownerType' }
    },
    { path: 'createdBy',  select: 'name email phone role' },
    { path: 'approvedBy', select: 'name email phone role' },
];

// ── getMaterials — with full population ───────────────────────────────────────
exports.getMaterials = async (req, res) => {
    try {
        let query = {};

        if (req.user && (req.user.role === 'Owner' || req.user.role === 'Office Owner')) {
            const user = await User.findById(req.user.id);
            const assignedUnits = user?.assignedUnits || [];
            
            query = {
                $or: [
                    { unit: { $in: assignedUnits } },
                    { createdBy: req.user._id }
                ]
            };
        } else if (req.user && req.user.role === 'Floor Admin') {
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds = floors.map(f => f._id);
            query = { floor: { $in: fIds } };
        }

        const data = await Material.find(query).populate(POPULATE).sort('-createdAt');
        res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// ── getMaterial (single) — with full population ───────────────────────────────
exports.getMaterial = async (req, res) => {
    try {
        const data = await Material.findById(req.params.id).populate(POPULATE);
        if (!data) return res.status(404).json({ success: false, error: 'Gate pass not found' });
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updateMaterial = factory.updateOne(Material);
exports.deleteMaterial = factory.deleteOne(Material);

// ── Custom createMaterial with approval-level notification ────────────────────
exports.createMaterial = async (req, res, next) => {
    try {
        const {
            property: propertyId,
            floor: floorId,
            unit: unitId,
            approvalLevel,
            ...rest
        } = req.body;

        // Resolve approval level automatically if not provided
        let resolvedLevel = 'Property Level';
        if (unitId)    resolvedLevel = 'Office Level';
        else if (floorId)  resolvedLevel = 'Floor Level';
        else if (propertyId) resolvedLevel = 'Property Level';

        const material = await Material.create({
            ...rest,
            property: propertyId || undefined,
            floor:    floorId    || undefined,
            unit:     unitId     || undefined,
            approvalLevel: approvalLevel || resolvedLevel,
            createdBy: req.user?._id,
            status: 'Pending'
        });

        // ── Fire notification to the appropriate authority ────────────────────
        try {
            let recipientUserId = null;
            let authorityLabel  = '';

            if (resolvedLevel === 'Office Level' && unitId) {
                // Notify the unit owner's user account
                const unit = await Unit.findById(unitId).populate('owner');
                if (unit?.owner?.user) {
                    recipientUserId = unit.owner.user;
                    authorityLabel  = `Office Owner (Unit ${unit.unitNumber})`;
                }
            } else if (resolvedLevel === 'Floor Level' && floorId) {
                // Notify the floor admin
                const floor = await Floor.findById(floorId);
                if (floor?.assignedAdmin) {
                    recipientUserId = floor.assignedAdmin;
                    authorityLabel  = `Floor Admin (Floor ${floor.floorNumber})`;
                } else if (floor?.assignedOwner) {
                    const owner = await require('../models/Owner').findById(floor.assignedOwner);
                    recipientUserId = owner?.user;
                    authorityLabel  = `Floor Owner (Floor ${floor.floorNumber})`;
                }
            } else if (resolvedLevel === 'Property Level' && propertyId) {
                // Notify Super Admin or Property Creator
                const property = await Property.findById(propertyId).populate('createdBy');
                recipientUserId = property?.createdBy?._id || property?.createdBy;
                authorityLabel  = `Property Owner (${property?.propertyName})`;
            }

            // Fallback: notify all Super Admins
            if (!recipientUserId) {
                const superAdmins = await User.find({ role: 'Super Admin' }).select('_id');
                for (const admin of superAdmins) {
                    await Notification.create({
                        user: admin._id,
                        title: 'Gate Pass Request',
                        message: `A new Gate Pass (${material.gatePassType}) has been submitted for "${material.materialDetails}". Approval Level: ${resolvedLevel}.`,
                        type: 'Alert'
                    });
                }
            } else {
                await Notification.create({
                    user: recipientUserId,
                    title: 'Gate Pass Approval Required',
                    message: `A new Gate Pass (${material.gatePassType}) for "${material.materialDetails}" requires your approval as ${authorityLabel}.`,
                    type: 'Alert'
                });
            }
        } catch (notifErr) {
            // Non-fatal: log but don't block response
            console.error('Notification error:', notifErr.message);
        }

        res.status(201).json({ success: true, data: material });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// ── Approve / Reject a Gate Pass ──────────────────────────────────────────────
exports.approveGatePass = async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;
        const allowed = ['Approved', 'Rejected', 'Cleared'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const update = {
            status,
            approvedBy: req.user?._id,
            approvedAt: new Date()
        };
        if (status === 'Rejected' && rejectionReason) {
            update.rejectionReason = rejectionReason;
        }

        const material = await Material.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!material) return res.status(404).json({ success: false, error: 'Gate pass not found' });

        res.status(200).json({ success: true, data: material });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
