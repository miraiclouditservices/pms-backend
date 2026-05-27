const Unit = require('../models/Unit');
const Owner = require('../models/Owner');
const factory = require('./factory');
const mongoose = require('mongoose');

// Get all units (with population & isolation check)
exports.getUnits = async (req, res, next) => {
    try {
        let reqQuery = { ...req.query };
        const removeFields = ['select', 'sort', 'page', 'limit'];
        removeFields.forEach(param => delete reqQuery[param]);

        // Strict data isolation filter for Floor Assignments
        if (req.user) {
            if (req.user.role === 'Office Owner' || req.user.role === 'Owner') {
                const owner = await mongoose.model('Owner').findOne({ user: req.user._id });
                if (!owner) return res.status(200).json({ success: true, count: 0, data: [] });
                
                // Find floors assigned to this owner
                const assignedFloors = await mongoose.model('Floor').find({ assignedOwner: owner._id });
                const floorIds = assignedFloors.map(f => f._id);
                reqQuery.floor = { $in: floorIds };
            } else if (req.user.role === 'Floor Admin') {
                // Find floors assigned to this admin
                const assignedFloors = await mongoose.model('Floor').find({ assignedAdmin: req.user._id });
                const floorIds = assignedFloors.map(f => f._id);
                reqQuery.floor = { $in: floorIds };
            }
        }

        const units = await Unit.find(reqQuery)
            .populate('property', 'propertyName building')
            .populate('floor', 'floorNumber')
            .populate('tenant', 'tenantName')
            .populate('lease', 'leaseStatus')
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
            .populate('floor', 'floorNumber')
            .populate('tenant', 'tenantName')
            .populate('lease', 'leaseStatus')
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

// @desc    Create unit
exports.createUnit = async (req, res, next) => {
    try {
        if (req.body.floor && req.body.sqft) {
            const floor = await mongoose.model('Floor').findById(req.body.floor);
            if (floor) {
                const effectiveAvailable = Math.max((floor.totalSft || 0) - (floor.occupiedSft || 0), 0);
                if (req.body.sqft > effectiveAvailable) {
                    return res.status(400).json({
                        success: false,
                        error: `Cannot create unit: ${req.body.sqft} SFT exceeds floor's available SFT of ${effectiveAvailable}`
                    });
                }
            }
        }
        const unit = await Unit.create(req.body);
        res.status(201).json({ success: true, data: unit });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, error: 'Duplicate unit number on this property.' });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update unit
exports.updateUnit = async (req, res, next) => {
    try {
        let unit = await Unit.findById(req.params.id);
        if (!unit) return res.status(404).json({ success: false, error: 'Unit not found' });

        if (req.body.floor && req.body.sqft) {
            const floor = await mongoose.model('Floor').findById(req.body.floor);
            // SFT validation (adjust availableSft by old unit sqft)
            if (floor) {
                const effectiveAvailable = Math.max((floor.totalSft || 0) - (floor.occupiedSft || 0), 0) + (unit.sqft || 0);
                if (req.body.sqft > effectiveAvailable) {
                    return res.status(400).json({
                        success: false,
                        error: `Cannot update unit: ${req.body.sqft} SFT exceeds floor's effective available SFT of ${effectiveAvailable}`
                    });
                }
            }
        }

        unit = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.status(200).json({ success: true, data: unit });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, error: 'Duplicate unit number on this property.' });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteUnit = factory.deleteOne(Unit);
