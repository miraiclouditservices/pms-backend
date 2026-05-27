const mongoose = require('mongoose');

const FloorAssignmentSchema = new mongoose.Schema({
    floor: { type: mongoose.Schema.ObjectId, ref: 'Floor', required: true },
    owner: { type: mongoose.Schema.ObjectId, ref: 'Owner', required: true },
    assignedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FloorAssignment', FloorAssignmentSchema);