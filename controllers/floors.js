const Floor = require('../models/Floor');
const mongoose = require('mongoose');

// @desc    Get all floors
exports.getFloors = async (req, res, next) => {
    try {
        let query = {};
        
        // Data isolation based on roles
        if (req.user) {
            if (req.user.role === 'OFFICE_OWNER' || req.user.role === 'Owner') {
                const owner = await mongoose.model('Owner').findOne({ user: req.user._id });
                if (!owner) return res.status(200).json({ success: true, count: 0, data: [], pagination: {} });
                
                // Get all units owned by this owner to find which floors they have access to
                const units = await mongoose.model('Unit').find({ owner: owner._id });
                const floorIds = units.map(u => u.floor);
                
                // They can see floors they own entirely OR floors where they own units
                query.$or = [
                    { assignedOwner: owner._id },
                    { _id: { $in: floorIds } }
                ];
            } else if (req.user.role === 'FLOOR_ADMIN') {
                query.assignedAdmin = req.user._id;
            } else if (req.user.role === 'STAFF_ADMIN') {
                const assignedProps = req.user.assignedProperties || [];
                const assignedFloors = req.user.assignedFloors || [];
                if (assignedProps.length === 0 && assignedFloors.length === 0) {
                    return res.status(200).json({ success: true, count: 0, pagination: {}, total: 0, totalPages: 0, data: [] });
                }
                query.$or = [];
                if (assignedProps.length > 0) {
                    query.$or.push({ property: { $in: assignedProps } });
                }
                if (assignedFloors.length > 0) {
                    query.$or.push({ _id: { $in: assignedFloors } });
                }
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

        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
            const assignedFloors = (req.user.assignedFloors || []).map(id => id.toString());
            const isPropAssigned = assignedProps.includes(floor.property?._id?.toString() || floor.property?.toString());
            const isFloorAssigned = assignedFloors.includes(floor._id.toString());
            if (!isPropAssigned && !isFloorAssigned) {
                return res.status(403).json({ success: false, error: 'Not authorized to access this floor' });
            }
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

        // Bidirectional sync: If assignedAdmin is provided on creation, update the User
        if (req.body.assignedAdmin) {
            const User = require('../models/User');
            await User.findByIdAndUpdate(req.body.assignedAdmin, {
                $addToSet: { assignedFloors: floor._id }
            });
        }

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

        const oldAdminId = floor.assignedAdmin;
        
        floor = await Floor.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Bidirectional sync: If assignedAdmin was changed via the Floor update, sync the User document
        if (req.body.assignedAdmin !== undefined && String(oldAdminId) !== String(req.body.assignedAdmin)) {
            const User = require('../models/User');
            
            // Remove floor from old admin's assignedFloors
            if (oldAdminId) {
                await User.findByIdAndUpdate(oldAdminId, {
                    $pull: { assignedFloors: floor._id }
                });
            }
            
            // Add floor to new admin's assignedFloors
            if (req.body.assignedAdmin) {
                await User.findByIdAndUpdate(req.body.assignedAdmin, {
                    $addToSet: { assignedFloors: floor._id }
                });
            }
        }

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
