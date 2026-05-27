const Floor = require('../models/Floor');
const mongoose = require('mongoose');

// @desc    Get all floors
exports.getFloors = async (req, res, next) => {
    try {
        let query = {};
        
        // Data isolation based on roles
        if (req.user) {
            if (req.user.role === 'Office Owner' || req.user.role === 'Owner') {
                const owner = await mongoose.model('Owner').findOne({ user: req.user._id });
                if (!owner) return res.status(200).json({ success: true, count: 0, data: [], pagination: {} });
                query.assignedOwner = owner._id;
            } else if (req.user.role === 'Floor Admin') {
                query.assignedAdmin = req.user._id;
            }
        }

        if (req.query.property) {
            query.property = req.query.property;
        }

        // Pagination parameters
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const total = await Floor.countDocuments(query);

        const floors = await Floor.find(query)
            .populate('property', 'propertyName propertyAddress')
            .populate('assignedOwner', 'ownerName contactNumber address')
            .populate('assignedAdmin', 'name email phoneNumber emergencyNumber address')
            .skip(startIndex)
            .limit(limit);

        // Pagination result
        const pagination = {};
        if (endIndex < total) {
            pagination.next = { page: page + 1, limit };
        }
        if (startIndex > 0) {
            pagination.prev = { page: page - 1, limit };
        }

        res.status(200).json({ 
            success: true, 
            count: floors.length, 
            pagination,
            total,
            totalPages: Math.ceil(total / limit),
            data: floors 
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get single floor
exports.getFloor = async (req, res, next) => {
    try {
        const floor = await Floor.findById(req.params.id)
            .populate('property', 'propertyName propertyAddress')
            .populate('assignedOwner', 'ownerName contactNumber address')
            .populate('assignedAdmin', 'name email phoneNumber emergencyNumber address');
        if (!floor) {
            return res.status(404).json({ success: false, error: `Floor not found with id of ${req.params.id}` });
        }
        res.status(200).json({ success: true, data: floor });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create new floor
exports.createFloor = async (req, res, next) => {
    try {
        const floor = await Floor.create(req.body);
        res.status(201).json({ success: true, data: floor });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update floor
exports.updateFloor = async (req, res, next) => {
    try {
        let floor = await Floor.findById(req.params.id);
        if (!floor) {
            return res.status(404).json({ success: false, error: `Floor not found with id of ${req.params.id}` });
        }
        floor = await Floor.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        res.status(200).json({ success: true, data: floor });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Delete floor
exports.deleteFloor = async (req, res, next) => {
    try {
        const floor = await Floor.findById(req.params.id);
        if (!floor) {
            return res.status(404).json({ success: false, error: `Floor not found with id of ${req.params.id}` });
        }
        await floor.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
