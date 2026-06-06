const Lease = require('../models/Lease');
const Unit = require('../models/Unit');
const Owner = require('../models/Owner');
const Property = require('../models/Property');
const Floor = require('../models/Floor');
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
        
        // Data isolation filter for Floor Assignments
        if (req.user) {
            if (req.user.role === 'OFFICE_OWNER' || req.user.role === 'Owner') {
                if (req.user.assignedUnits && req.user.assignedUnits.length > 0) {
                    query.units = { $in: req.user.assignedUnits };
                } else {
                    const owner = await Owner.findOne({ user: req.user._id });
                    if (!owner) return res.status(200).json({ success: true, count: 0, data: [] });
                    
                    // Find floors assigned to this owner
                    const assignedFloors = await Floor.find({ assignedOwner: owner._id });
                    const floorIds = assignedFloors.map(f => f._id);
                    query.floor = { $in: floorIds };
                }
            } else if (req.user.role === 'FLOOR_ADMIN') {
                // Find floors assigned to this admin
                const assignedFloors = await Floor.find({ assignedAdmin: req.user._id });
                const floorIds = assignedFloors.map(f => f._id);
                query.floor = { $in: floorIds };
            } else if (req.user.role === 'STAFF_ADMIN') {
                const assignedProps = req.user.assignedProperties || [];
                const assignedFloors = req.user.assignedFloors || [];
                if (assignedProps.length === 0 && assignedFloors.length === 0) {
                    return res.status(200).json({ success: true, total: 0, pagination: { page, limit, totalPages: 0 }, data: [] });
                }
                query.$or = [];
                if (assignedProps.length > 0) {
                    query.$or.push({ property: { $in: assignedProps } });
                }
                if (assignedFloors.length > 0) {
                    query.$or.push({ floor: { $in: assignedFloors } });
                }
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

        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
            const assignedFloors = (req.user.assignedFloors || []).map(id => id.toString());
            const isPropAssigned = assignedProps.includes(lease.property?._id?.toString() || lease.property?.toString());
            const isFloorAssigned = assignedFloors.includes(lease.floor?._id?.toString() || lease.floor?.toString());
            if (!isPropAssigned && !isFloorAssigned) {
                return res.status(403).json({ success: false, error: 'Not authorized to access this lease' });
            }
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
            
            // Validation: Prevent lease assignment to occupied units
            const occupiedUnits = units.filter(u => u.unitStatus === 'Occupied');
            if (occupiedUnits.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Cannot assign lease to already occupied units: ${occupiedUnits.map(u => u.unitNumber).join(', ')}`
                });
            }

            units.forEach(u => allocatedSft += (u.sqft || 0));
        }
        req.body.allocatedSft = allocatedSft;

        const lease = await Lease.create(req.body);

        // Update unit status to 'Occupied' and link lease for all linked units
        if (lease.units && lease.units.length > 0) {
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Occupied', lease: lease._id }
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

        // Reset old units to Available and clear lease before update
        let oldPropertyIds = [];
        if (oldLease.units && oldLease.units.length > 0) {
            const oldUnits = await Unit.find({ _id: { $in: oldLease.units } });
            oldPropertyIds = [...new Set(oldUnits.map(u => u.property.toString()))];
            
            await Unit.updateMany(
                { _id: { $in: oldLease.units } },
                { unitStatus: 'Available', lease: null }
            );
        }

        let allocatedSft = 0;
        if (req.body.units && req.body.units.length > 0) {
            const units = await Unit.find({ _id: { $in: req.body.units } });
            
            // Prevent lease assignment to occupied units (exclude units from the old lease)
            const oldUnitIds = oldLease.units.map(u => u.toString());
            const occupiedUnits = units.filter(u => u.unitStatus === 'Occupied' && !oldUnitIds.includes(u._id.toString()));
            if (occupiedUnits.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Cannot assign lease to already occupied units: ${occupiedUnits.map(u => u.unitNumber).join(', ')}`
                });
            }

            units.forEach(u => allocatedSft += (u.sqft || 0));
        }
        req.body.allocatedSft = allocatedSft;

        const lease = await Lease.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        let newPropertyIds = [];
        // Set new/updated units to Occupied and link lease
        if (lease.units && lease.units.length > 0 && lease.status === 'Active') {
            const newUnits = await Unit.find({ _id: { $in: lease.units } });
            newPropertyIds = [...new Set(newUnits.map(u => u.property.toString()))];
            
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Occupied', lease: lease._id }
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

        // Restore units to Available and clear lease before deleting lease
        if (lease.units && lease.units.length > 0) {
            const units = await Unit.find({ _id: { $in: lease.units } });
            const propertyIds = [...new Set(units.map(u => u.property.toString()))];
            
            await Unit.updateMany(
                { _id: { $in: lease.units } },
                { unitStatus: 'Available', lease: null }
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
