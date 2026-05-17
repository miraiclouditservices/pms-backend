const mongoose = require('mongoose');

const AMCSchema = new mongoose.Schema({
    amcId: {
        type: String,
        unique: true
    },
    asset: {
        type: mongoose.Schema.ObjectId,
        ref: 'Asset',
        required: true
    },
    startDate: {
        type: Date,
        required: [true, 'Please add a start date']
    },
    endDate: {
        type: Date,
        required: [true, 'Please add an end date']
    },
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Vendor',
        required: true
    },
    contactName: {
        type: String
    },
    contactNumber: {
        type: String
    },
    amcValue: {
        type: Number
    },
    amcStatus: {
        type: String,
        enum: ['Active', 'Expired'],
        default: 'Active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-generate AMC ID if not provided
AMCSchema.pre('save', async function() {
    if (!this.amcId) {
        this.amcId = 'AMC-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
});

module.exports = mongoose.model('AMC', AMCSchema);
