const mongoose = require('mongoose');

const UnitSchema = new mongoose.Schema({
    property: {
        type: mongoose.Schema.ObjectId,
        ref: 'Property',
        required: true
    },
    floorNumber: {
        type: String,
        required: [true, 'Please add a floor number']
    },
    unitNumber: {
        type: String,
        required: [true, 'Please add a unit number']
    },
    sqft: {
        type: Number,
        required: [true, 'Please add square feet']
    },
    carParking: {
        type: Number,
        default: 0
    },
    bikeParking: {
        type: Number,
        default: 0
    },
    unitType: {
        type: String,
        enum: ['Residential', 'Commercial', 'Office', 'IT', 'Retail', 'Standard'],
        default: 'Standard'
    },
    unitStatus: {
        type: String,
        enum: ['Vacant', 'Occupied', 'Maintenance', 'Reserved'],
        default: 'Vacant'
    },
    ownerName: {
        type: String
    },
    remarks: {
        type: String
    },
    owner: {
        type: mongoose.Schema.ObjectId,
        ref: 'Owner'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure unitNumber is unique within a property
UnitSchema.index({ property: 1, unitNumber: 1 }, { unique: true });

module.exports = mongoose.model('Unit', UnitSchema);
