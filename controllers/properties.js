const Property = require('../models/Property');
const Owner = require('../models/Owner');
const Unit = require('../models/Unit');

// @desc    Get all properties
// @route   GET /api/properties
// @access  Private
exports.getProperties = async (req, res, next) => {
    try {
        let query;
        
        // If Owner, show only properties they have assigned units in
        if (req.user.role === 'Owner') {
            const owner = await Owner.findOne({ user: req.user._id });
            if (owner) {
                // Dual-lookup lookup: retrieve units both by owner field on Unit and unitsAssigned array on Owner
                const unitsByOwner = await Unit.find({ owner: owner._id });
                const populatedOwner = await Owner.findById(owner._id).populate('unitsAssigned');
                const unitsFromProfile = populatedOwner ? (populatedOwner.unitsAssigned || []) : [];

                // Combine and de-duplicate units
                const combinedUnits = [...unitsByOwner, ...unitsFromProfile];
                const uniqueMap = new Map();
                combinedUnits.forEach(u => {
                    if (u && u._id) uniqueMap.set(u._id.toString(), u);
                });
                const assignedUnits = Array.from(uniqueMap.values());

                if (assignedUnits.length > 0) {
                    const propertyIds = [...new Set(assignedUnits.map(u => (u.property?._id || u.property)?.toString()).filter(Boolean))];
                    query = Property.find({ _id: { $in: propertyIds } });
                } else {
                    return res.status(200).json({
                        success: true,
                        count: 0,
                        data: []
                    });
                }
            } else {
                return res.status(200).json({
                    success: true,
                    count: 0,
                    data: []
                });
            }
        } else {
            query = Property.find();
        }

        const properties = await query;

        res.status(200).json({
            success: true,
            count: properties.length,
            data: properties
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
        const property = await Property.create(req.body);

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
