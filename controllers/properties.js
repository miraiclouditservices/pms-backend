const Property = require('../models/Property');
const Owner = require('../models/Owner');
const Unit = require('../models/Unit');
const mongoose = require('mongoose');

// @desc    Get all properties
// @route   GET /api/properties
// @access  Private
exports.getProperties = async (req, res, next) => {
    try {
        const { search, status, type, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build text search filter
        const searchFilter = search
            ? {
                $or: [
                    { propertyName: { $regex: search, $options: 'i' } },
                    { propertyAddress: { $regex: search, $options: 'i' } },
                    { propertyType: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                ]
            }
            : {};

        if (status && status !== 'All') searchFilter.status = status;
        if (type && type !== 'All') searchFilter.propertyType = { $regex: type, $options: 'i' };

        let baseFilter = {};

        // Role-based property isolation
        if (req.user && (req.user.role === 'OFFICE_OWNER' || req.user.role === 'Owner')) {
            const owner = await Owner.findOne({ user: req.user._id });
            if (owner) {
                const assignedFloors = await mongoose.model('Floor').find({ assignedOwner: owner._id });
                if (assignedFloors.length > 0) {
                    const propertyIds = [...new Set(assignedFloors.map(f => f.property.toString()))];
                    baseFilter = { _id: { $in: propertyIds } };
                } else {
                    return res.status(200).json({ success: true, count: 0, data: [], pagination: { total: 0, page: 1, pages: 1 } });
                }
            } else {
                return res.status(200).json({ success: true, count: 0, data: [], pagination: { total: 0, page: 1, pages: 1 } });
            }
        } else if (req.user && req.user.role === 'FLOOR_ADMIN') {
            const assignedFloors = await mongoose.model('Floor').find({ assignedAdmin: req.user._id });
            if (assignedFloors.length > 0) {
                const propertyIds = [...new Set(assignedFloors.map(f => f.property.toString()))];
                baseFilter = { _id: { $in: propertyIds } };
            } else {
                return res.status(200).json({ success: true, count: 0, data: [], pagination: { total: 0, page: 1, pages: 1 } });
            }
        } else if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = req.user.assignedProperties || [];
            const assignedFloors = req.user.assignedFloors || [];
            const propertyIds = [...assignedProps.map(p => p.toString())];
            if (assignedFloors.length > 0) {
                const floors = await mongoose.model('Floor').find({ _id: { $in: assignedFloors } });
                propertyIds.push(...floors.map(f => f.property.toString()));
            }
            const uniqueIds = [...new Set(propertyIds)];
            if (uniqueIds.length > 0) {
                baseFilter = { _id: { $in: uniqueIds } };
            } else {
                return res.status(200).json({ success: true, count: 0, data: [], pagination: { total: 0, page: 1, pages: 1 } });
            }
        }

        const finalFilter = { ...baseFilter, ...searchFilter };
        const total = await Property.countDocuments(finalFilter);
        const properties = await Property.find(finalFilter)
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            count: properties.length,
            data: properties,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};


// @desc    Get single property
// @route   GET /api/properties/:id
// @access  Private
exports.getProperty = async (req, res, next) => {
    try {
        const property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ success: false, error: 'Property not found' });
        }

        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
            const assignedFloors = req.user.assignedFloors || [];
            const allowedProps = [...assignedProps];
            if (assignedFloors.length > 0) {
                const floors = await mongoose.model('Floor').find({ _id: { $in: assignedFloors } });
                allowedProps.push(...floors.map(f => f.property.toString()));
            }
            const uniqueAllowedProps = [...new Set(allowedProps)];
            if (!uniqueAllowedProps.includes(property._id.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to access this property' });
            }
        }

        res.status(200).json({
            success: true,
            data: property
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create property
// @route   POST /api/properties
// @access  Private/Admin
exports.createProperty = async (req, res, next) => {
    try {
        if (req.user) {
            req.body.createdBy = req.user._id;
        }
        const property = await Property.create(req.body);

        // Auto-generate floors
        const Floor = require('../models/Floor');
        const floorsToCreate = [];

        if (req.body.towerConfigs && req.body.towerConfigs.length > 0) {
            req.body.towerConfigs.forEach(tower => {
                for (let i = 1; i <= tower.floors; i++) {
                    floorsToCreate.push({
                        property: property._id,
                        floorNumber: `${tower.name}-${i}`,
                        floorName: `${tower.name} - Floor ${i}`,
                        totalSft: tower.sft || 0,
                        status: 'Active'
                    });
                }
            });
        } else if (req.body.totalFloors) {
            for (let i = 1; i <= req.body.totalFloors; i++) {
                floorsToCreate.push({
                    property: property._id,
                    floorNumber: i.toString(),
                    floorName: `Floor ${i}`,
                    totalSft: req.body.totalSft ? Math.floor(req.body.totalSft / req.body.totalFloors) : 0,
                    status: 'Active'
                });
            }
        }

        if (floorsToCreate.length > 0) {
            await Floor.insertMany(floorsToCreate);
        }

        res.status(201).json({
            success: true,
            data: property
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update property
// @route   PUT /api/properties/:id
// @access  Private/Admin
exports.updateProperty = async (req, res, next) => {
    try {
        let property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ success: false, error: 'Property not found' });
        }

        property = await Property.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: property
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Delete property
// @route   DELETE /api/properties/:id
// @access  Private/Admin
exports.deleteProperty = async (req, res, next) => {
    try {
        const property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ success: false, error: 'Property not found' });
        }

        await property.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get property structure (floors and units)
// @route   GET /api/properties/:id/floors-units
// @access  Private
exports.getPropertyStructure = async (req, res, next) => {
    try {
        const property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ success: false, error: 'Property not found' });
        }

        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
            const assignedFloors = req.user.assignedFloors || [];
            const allowedProps = [...assignedProps];
            if (assignedFloors.length > 0) {
                const floors = await mongoose.model('Floor').find({ _id: { $in: assignedFloors } });
                allowedProps.push(...floors.map(f => f.property.toString()));
            }
            const uniqueAllowedProps = [...new Set(allowedProps)];
            if (!uniqueAllowedProps.includes(property._id.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to access this property structure' });
            }
        }

        const units = await Unit.find({ property: property._id }).sort({ floorNumber: 1, unitNumber: 1 });

        const floorsMap = {};
        units.forEach(unit => {
            const floorName = unit.floorNumber ? `Floor ${unit.floorNumber}` : 'Main Block';
            if (!floorsMap[floorName]) {
                floorsMap[floorName] = {
                    floorName,
                    units: []
                };
            }
            floorsMap[floorName].units.push({
                unitId: unit._id,
                unitName: unit.unitNumber,
                sft: unit.sqft || 0,
                status: unit.unitStatus
            });
        });

        const structure = {
            propertyName: property.propertyName,
            totalSft: property.totalSft || 0,
            occupiedSft: property.occupiedSft || 0,
            availableSft: property.availableSft || 0,
            floors: Object.values(floorsMap)
        };

        res.status(200).json({
            success: true,
            data: structure
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
