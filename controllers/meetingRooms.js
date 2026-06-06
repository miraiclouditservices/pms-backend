const MeetingRoom = require('../models/MeetingRoom');
const Floor = require('../models/Floor');
const Unit = require('../models/Unit');

// @desc    Get all meeting rooms
// @route   GET /api/meeting-rooms
// @access  Private
exports.getMeetingRooms = async (req, res, next) => {
    try {
        let query = {};

        // Role-based filtering
        if (req.user && req.user.role === 'FLOOR_ADMIN') {
            query.floor = { $in: req.user.assignedFloors || [] };
        } else if (req.user && (req.user.role === 'OFFICE_OWNER' || req.user.role === 'Tenant')) {
            query.floor = { $in: req.user.assignedFloors || [] };
        } else if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = req.user.assignedProperties || [];
            const assignedFloors = req.user.assignedFloors || [];
            if (assignedProps.length === 0 && assignedFloors.length === 0) {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
            query.$or = [];
            if (assignedProps.length > 0) {
                query.$or.push({ property: { $in: assignedProps } });
            }
            if (assignedFloors.length > 0) {
                query.$or.push({ floor: { $in: assignedFloors } });
            }
        }

        if (req.query.property) {
            query.property = req.query.property;
        }
        if (req.query.floor) {
            query.floor = req.query.floor;
        }

        const data = await MeetingRoom.find(query)
            .populate('property', 'propertyName')
            .populate('floor', 'floorNumber floorName')
            .populate('unit', 'unitNumber unitName sqft')
            .sort('-createdAt');

        res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get single meeting room
// @route   GET /api/meeting-rooms/:id
// @access  Private
exports.getMeetingRoom = async (req, res, next) => {
    try {
        const data = await MeetingRoom.findById(req.params.id)
            .populate('property', 'propertyName')
            .populate('floor', 'floorNumber floorName')
            .populate('unit', 'unitNumber unitName sqft');

        if (!data) {
            return res.status(404).json({ success: false, error: 'Meeting room not found' });
        }

        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
            const assignedFloors = (req.user.assignedFloors || []).map(id => id.toString());
            const isPropAssigned = assignedProps.includes(data.property?._id?.toString() || data.property?.toString());
            const isFloorAssigned = assignedFloors.includes(data.floor?._id?.toString() || data.floor?.toString());
            if (!isPropAssigned && !isFloorAssigned) {
                return res.status(403).json({ success: false, error: 'Not authorized to access this meeting room' });
            }
        }

        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create a meeting room
// @route   POST /api/meeting-rooms
// @access  Private (SUPER_ADMIN, FLOOR_ADMIN)
exports.createMeetingRoom = async (req, res, next) => {
    try {
        // Enforce FLOOR_ADMIN constraint to only create on their assigned floors
        if (req.user.role === 'FLOOR_ADMIN') {
            const assignedFloors = req.user.assignedFloors.map(id => id.toString());
            if (!assignedFloors.includes(req.body.floor)) {
                return res.status(403).json({ success: false, error: 'You can only create meeting rooms on your assigned floors' });
            }
        }

        let assignedUnit = null;
        if (req.body.unit) {
            assignedUnit = await Unit.findById(req.body.unit);
            if (!assignedUnit) {
                return res.status(404).json({ success: false, error: 'Assigned floor unit not found' });
            }
            // Auto-assign sqft from unit
            req.body.sqft = assignedUnit.sqft;
        }

        // Validate SFT availability on the floor (only if it is a standalone room)
        const floor = await Floor.findById(req.body.floor);
        if (!floor) {
            return res.status(404).json({ success: false, error: 'Target floor not found' });
        }

        if (!req.body.unit) {
            const requestedSft = Number(req.body.sqft || 0);
            if (floor.availableSft < requestedSft) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Insufficient available space on the floor. Requested: ${requestedSft} SFT, Available: ${floor.availableSft} SFT` 
                });
            }
        }

        const data = await MeetingRoom.create(req.body);

        // Update unit status if assigned
        if (assignedUnit) {
            assignedUnit.unitStatus = 'Reserved';
            await assignedUnit.save({ validateBeforeSave: false });
        }
        
        // Recalculate floor stats
        await Floor.updateFloorStats(req.body.floor);

        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update meeting room
// @route   PUT /api/meeting-rooms/:id
// @access  Private (SUPER_ADMIN, FLOOR_ADMIN)
exports.updateMeetingRoom = async (req, res, next) => {
    try {
        let room = await MeetingRoom.findById(req.params.id);
        if (!room) {
            return res.status(404).json({ success: false, error: 'Meeting room not found' });
        }

        // Enforce FLOOR_ADMIN constraints
        if (req.user.role === 'FLOOR_ADMIN') {
            const assignedFloors = req.user.assignedFloors.map(id => id.toString());
            if (!assignedFloors.includes(room.floor.toString())) {
                return res.status(403).json({ success: false, error: 'Unauthorized to modify rooms on this floor' });
            }
        }

        // If assigning to a different unit
        const oldUnitId = room.unit ? room.unit.toString() : null;
        const newUnitId = req.body.unit || null;

        if (newUnitId && newUnitId !== oldUnitId) {
            const newUnit = await Unit.findById(newUnitId);
            if (!newUnit) {
                return res.status(404).json({ success: false, error: 'New assigned unit not found' });
            }
            req.body.sqft = newUnit.sqft; // Auto-assign sqft
        }

        // If SFT is changing (standalone only), check space limits
        if (!newUnitId && req.body.sqft && Number(req.body.sqft) !== room.sqft) {
            const floor = await Floor.findById(room.floor);
            const additionalNeeded = Number(req.body.sqft) - room.sqft;
            if (floor.availableSft < additionalNeeded) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Insufficient available space on the floor to expand. Additional needed: ${additionalNeeded} SFT, Available: ${floor.availableSft} SFT` 
                });
            }
        }

        const data = await MeetingRoom.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Sync old and new unit statuses
        if (oldUnitId && oldUnitId !== newUnitId) {
            await Unit.findByIdAndUpdate(oldUnitId, { unitStatus: 'Available' });
        }
        if (newUnitId && newUnitId !== oldUnitId) {
            await Unit.findByIdAndUpdate(newUnitId, { unitStatus: 'Reserved' });
        }

        // Recalculate floor stats
        await Floor.updateFloorStats(room.floor);

        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Delete meeting room
// @route   DELETE /api/meeting-rooms/:id
// @access  Private (SUPER_ADMIN, FLOOR_ADMIN)
exports.deleteMeetingRoom = async (req, res, next) => {
    try {
        const room = await MeetingRoom.findById(req.params.id);
        if (!room) {
            return res.status(404).json({ success: false, error: 'Meeting room not found' });
        }

        // Enforce FLOOR_ADMIN constraints
        if (req.user.role === 'FLOOR_ADMIN') {
            const assignedFloors = req.user.assignedFloors.map(id => id.toString());
            if (!assignedFloors.includes(room.floor.toString())) {
                return res.status(403).json({ success: false, error: 'Unauthorized to delete rooms on this floor' });
            }
        }

        const floorId = room.floor;
        const unitId = room.unit;

        await room.deleteOne();

        // Release the unit status back to Available
        if (unitId) {
            await Unit.findByIdAndUpdate(unitId, { unitStatus: 'Available' });
        }

        // Recalculate floor stats
        await Floor.updateFloorStats(floorId);

        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
