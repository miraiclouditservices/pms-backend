const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
    vendorCode: {
        type: String,
        unique: true
    },
    vendorName: {
        type: String,
        required: [true, 'Please add a vendor name']
    },
    address: {
        type: String
    },
    scopeOfWork: {
        type: String
    },
    contactName: {
        type: String
    },
    mobileNumber: {
        type: String,
        required: [true, 'Please add a mobile number']
    },
    emailId: {
        type: String,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    gstNumber: {
        type: String
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-generate vendor code if not provided
VendorSchema.pre('save', async function() {
    if (!this.vendorCode) {
        this.vendorCode = 'VND-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
});

module.exports = mongoose.model('Vendor', VendorSchema);
