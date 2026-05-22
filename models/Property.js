const mongoose = require('mongoose');

const PropertySchema = new mongoose.Schema({
    propertyName: {
        type: String,
        required: [true, 'Please add a property name'],
        trim: true
    },
    totalFloors: {
        type: Number,
        required: [true, 'Please add total floors']
    },
    totalBasements: {
        type: Number,
        default: 0
    },
    propertyAddress: {
        type: String,
        required: [true, 'Please add property address']
    },
    propertyType: {
        type: String,
        required: [true, 'Please add property type'],
        enum: ['Residential', 'Commercial', 'Industrial', 'Mixed-Use', 'Office']
    },
    openingTime: {
        type: String
    },
    closingTime: {
        type: String
    },
    totalUnits: {
        type: Number,
        required: [true, 'Please add total units']
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Maintenance', 'Pre-Launch'],
        default: 'Active'
    },
    occupancy: {
        type: Number,
        default: 0
    },
    totalSft: {
        type: Number,
        default: 0
    },
    occupiedSft: {
        type: Number,
        default: 0
    },
    availableSft: {
        type: Number,
        default: 0
    },
    occupancyPercentage: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Property', PropertySchema);
