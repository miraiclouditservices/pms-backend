const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema({
    gatePassType: {
        type: String,
        enum: ['Inward', 'Outward'],
        required: [true, 'Please specify gate pass type']
    },
    materialDetails: {
        type: String,
        required: [true, 'Please add material details']
    },
    hsnCode: {
        type: String
    },
    quantity: {
        type: Number,
        required: [true, 'Please add quantity']
    },
    rate: {
        type: Number,
        required: [true, 'Please add rate']
    },
    totalCost: {
        type: Number
    },
    placeOfVisit: {
        type: String
    },
    purposeOfVisit: {
        type: String
    },
    vehicleNumber: {
        type: String
    },
    building: {
        type: String
    },
    floor: {
        type: String
    },
    unit: {
        type: String
    },
    officeName: {
        type: String
    },
    officeDetails: {
        type: String
    },
    inTime: {
        type: String,
        default: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    },
    outTime: {
        type: String
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Cleared'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save to calculate total cost
MaterialSchema.pre('save', async function () {
    if (this.quantity && this.rate) {
        this.totalCost = this.quantity * this.rate;
    }
});

module.exports = mongoose.model('Material', MaterialSchema);
