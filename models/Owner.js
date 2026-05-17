const mongoose = require('mongoose');

const OwnerSchema = new mongoose.Schema({
    ownerName: {
        type: String,
        required: [true, 'Please add owner name']
    },
    contactNumber: {
        type: String,
        required: [true, 'Please add contact number']
    },
    alternateNumber: {
        type: String
    },
    emailId: {
        type: String,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please add a valid email']
    },
    address: {
        type: String
    },
    gstNumber: {
        type: String
    },
    companyRegNo: {
        type: String
    },
    contactPerson: {
        type: String
    },
    designation: {
        type: String
    },
    idProofType: {
        type: String,
        enum: ['Aadhar', 'PAN', 'Passport', 'Voter ID', 'Driving License', 'Company Registration']
    },
    idProofNumber: {
        type: String
    },
    unitsAssigned: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Unit'
    }],
    documents: [{
        name: String,
        url: String
    }],
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    ownerType: {
        type: String,
        enum: ['Individual', 'Company'],
        default: 'Individual'
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Owner', OwnerSchema);
