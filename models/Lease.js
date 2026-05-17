const mongoose = require('mongoose');

const LeaseSchema = new mongoose.Schema({
    tenantName: {
        type: String,
        required: [true, 'Please add tenant/lease holder name']
    },
    tenantContact: {
        type: String,
        required: [true, 'Please add contact number']
    },
    tenantEmail: {
        type: String,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please add a valid email']
    },
    owner: {
        type: mongoose.Schema.ObjectId,
        ref: 'Owner',
        required: [true, 'Please link the property owner']
    },
    units: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Unit',
        required: [true, 'Please select at least one unit']
    }],
    startDate: {
        type: Date,
        required: [true, 'Please add lease start date']
    },
    endDate: {
        type: Date,
        required: [true, 'Please add lease end date']
    },
    monthlyRent: {
        type: Number,
        required: [true, 'Please add monthly rent']
    },
    securityDeposit: {
        type: Number
    },
    maintenanceCharges: {
        type: Number,
        default: 0
    },
    escalationPercentage: {
        type: Number,
        default: 0,
        description: 'Annual rent increase percentage'
    },
    dueDay: {
        type: Number,
        default: 5,
        min: 1,
        max: 31,
        description: 'Monthly date when rent is due'
    },
    status: {
        type: String,
        enum: ['Active', 'Expired', 'Terminated', 'Pending'],
        default: 'Active'
    },
    agreementUrl: {
        type: String
    },
    remarks: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Lease', LeaseSchema);
