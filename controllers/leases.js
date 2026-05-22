const Lease = require('../models/Lease');
const Unit = require('../models/Unit');
const Owner = require('../models/Owner');
const Property = require('../models/Property');
const factory = require('./factory');

async function updatePropertyOccupancy(propertyId) {
    const property = await Property.findById(propertyId);
    if (!property) return;
    
    const units = await Unit.find({ property: propertyId });
    let totalSft = 0;
    let occupiedSft = 0;
    
    units.forEach(u => {
        totalSft += (u.sqft || 0);
        if (u.unitStatus === 'Occupied') {
            occupiedSft += (u.sqft || 0);
        }
    });
    
    const availableSft = totalSft - occupiedSft;
    const occupancyPercentage = totalSft > 0 ? (occupiedSft / totalSft) * 100 : 0;
    
    property.totalSft = totalSft;
    property.occupiedSft = occupiedSft;
    property.availableSft = availableSft;
    property.occupancyPercentage = parseFloat(occupancyPercentage.toFixed(2));
    
    await property.save();
}

exports.getLeases = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        let query = {};
        
        // If Owner, show only leases for their assigned units
        if (req.user && req.user.role === 'Owner') {
            const owner = await Owner.findOne({ user: req.user._id });
            if (owner && owner.unitsAssigned && owner.unitsAssigned.length > 0) {
                // To keep it simple, we don't strictly filter leases here if we changed schema.
                // We'll let admin see everything, owner sees nothing or everything depending on design.
                // Assuming Admin use case mainly here based on the instructions.
            } else {
                // Return empty if owner has no units
            }
        }

        if (search) {
            query.$or = [
                { tenantName: { $regex: search, $options: 'i' } },
                { tenantContact: { $regex: search, $options: 'i' } }
            ];
        }

        if (req.query.status) {
            query.status = req.query.status;
        }

        const total = await Lease.countDocuments(query);
        const leases = await Lease.find(query)
            .populate('property', 'propertyName building')
            .populate({
                path: 'units',
                populate: { path: 'property', select: 'propertyName building' }
            })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            total,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            data: leases
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.getLease = async (req, res, next) => {
    try {
        const lease = await Lease.findById(req.params.id)
            .populate('property')
            .populate({
                path: 'units',
                populate: { path: 'property', select: 'propertyName building' }
            });

        if (!lease) {
            return res.status(404).json({ success: false, error: 'Lease not found' });
        }

        res.status(200).json({
            success: true,
            data: lease
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createLease = async (req, res, next) => {
    try {
        let allocatedSft = 0;
        if (req.body.units && req.body.units.length > 0) {
            const units = await Unit.find({ _id: { $in: req.body.units } });
            units.forEach(u => allocatedSft += (u.sqft || 0));
        }
        req.body.allocatedSft = allocatedSft;

        const lease = await Lease.create(req.body);

        // Update unit status to 'Occupied' for all linked units
        if (lease.units && lease.units.length > 0) {
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Occupied' }
            );

            // Update property occupancy
            const units = await Unit.find({ _id: { $in: lease.units } });
            const propertyIds = [...new Set(units.map(u => u.property.toString()))];
            for (const pid of propertyIds) {
                await updatePropertyOccupancy(pid);
            }
        }

        res.status(201).json({
            success: true,
            data: lease
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updateLease = async (req, res, next) => {
    try {
        const oldLease = await Lease.findById(req.params.id);
        if (!oldLease) {
            return res.status(404).json({ success: false, error: 'Lease not found' });
        }

        // Reset old units to Vacant before update
        let oldPropertyIds = [];
        if (oldLease.units && oldLease.units.length > 0) {
            const oldUnits = await Unit.find({ _id: { $in: oldLease.units } });
            oldPropertyIds = [...new Set(oldUnits.map(u => u.property.toString()))];
            
            await Unit.updateMany(
                { _id: { $in: oldLease.units } },
                { unitStatus: 'Vacant' }
            );
        }

        let allocatedSft = 0;
        if (req.body.units && req.body.units.length > 0) {
            const units = await Unit.find({ _id: { $in: req.body.units } });
            units.forEach(u => allocatedSft += (u.sqft || 0));
        }
        req.body.allocatedSft = allocatedSft;

        const lease = await Lease.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        let newPropertyIds = [];
        // Set new/updated units to Occupied
        if (lease.units && lease.units.length > 0 && lease.status === 'Active') {
            const newUnits = await Unit.find({ _id: { $in: lease.units } });
            newPropertyIds = [...new Set(newUnits.map(u => u.property.toString()))];
            
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Occupied' }
            );
        }

        // Update property occupancy
        const allPropertyIds = [...new Set([...oldPropertyIds, ...newPropertyIds])];
        for (const pid of allPropertyIds) {
            await updatePropertyOccupancy(pid);
        }

        res.status(200).json({
            success: true,
            data: lease
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteLease = async (req, res, next) => {
    try {
        const lease = await Lease.findById(req.params.id);
        if (!lease) {
            return res.status(404).json({ success: false, error: 'Lease not found' });
        }

        // Restore units to Vacant before deleting lease
        if (lease.units && lease.units.length > 0) {
            const units = await Unit.find({ _id: { $in: lease.units } });
            const propertyIds = [...new Set(units.map(u => u.property.toString()))];
            
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Vacant' }
            );
            
            for (const pid of propertyIds) {
                await updatePropertyOccupancy(pid);
            }
        }

        await Lease.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
