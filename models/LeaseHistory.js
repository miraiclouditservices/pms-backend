const mongoose = require('mongoose');

const LeaseHistorySchema = new mongoose.Schema({
    lease: {
        type: mongoose.Schema.ObjectId,
        ref: 'Lease',
        required: true
    },
    action: {
        type: String,
        enum: ['Created', 'Updated', 'Escalated', 'Expired', 'Terminated', 'Renewed'],
        required: true
    },
    previousStatus: String,
    newStatus: String,
    previousRent: Number,
    newRent: Number,
    remarks: String,
    changedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    changedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('LeaseHistory', LeaseHistorySchema);
