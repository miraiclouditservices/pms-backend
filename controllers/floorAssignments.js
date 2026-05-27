const FloorAssignment = require('../models/FloorAssignment');
const Floor = require('../models/Floor');

exports.getFloorAssignments = async (req, res, next) => {
    try {
        const data = await FloorAssignment.find().populate({
            path: 'floor',
            populate: { path: 'property', select: 'propertyName' }
        }).populate('owner');
        res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createFloorAssignment = async (req, res, next) => {
    try {
        const { floor, owner } = req.body;
        const assignment = await FloorAssignment.create({ floor, owner, assignedBy: req.user?.id });
        
        // Update the Floor model to reflect this assignment
        await Floor.findByIdAndUpdate(floor, { assignedOwner: owner });

        res.status(201).json({ success: true, data: assignment });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteFloorAssignment = async (req, res, next) => {
    try {
        const assignment = await FloorAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        }
        // Remove assignment from Floor
        await Floor.findByIdAndUpdate(assignment.floor, { assignedOwner: null });
        await assignment.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
