const Unit = require('../models/Unit');
const Owner = require('../models/Owner');
const factory = require('./factory');

// Get all units (with population & isolation check)
exports.getUnits = async (req, res, next) => {
    try {
        let reqQuery = { ...req.query };
        const removeFields = ['select', 'sort', 'page', 'limit'];
        removeFields.forEach(param => delete reqQuery[param]);

        // Strict data isolation filter for Owners
        if (req.user && req.user.role === 'Owner') {
            const owner = await Owner.findOne({ user: req.user._id }).populate('unitsAssigned');
            if (!owner) {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
            const assignedUnits = owner.unitsAssigned || [];
            const assignedUnitNumbers = assignedUnits.map(u => u.unitNumber);
            reqQuery.unitNumber = { $in: assignedUnitNumbers };
        }

        const units = await Unit.find(reqQuery)
            .populate('property', 'propertyName building')
            .populate('owner', 'ownerName contactNumber');

        res.status(200).json({
            success: true,
            count: units.length,
            data: units
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Get single unit with population
exports.getUnit = async (req, res, next) => {
    try {
        const unit = await Unit.findById(req.params.id)
            .populate('property', 'propertyName building')
            .populate('owner', 'ownerName contactNumber');

        if (!unit) {
            return res.status(404).json({ success: false, error: 'Unit not found' });
        }

        res.status(200).json({
            success: true,
            data: unit
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createUnit = factory.createOne(Unit);
exports.updateUnit = factory.updateOne(Unit);
exports.deleteUnit = factory.deleteOne(Unit);
