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
    contactNumber: {
        type: String,
        required: [true, 'Please add a contact number']
    },
    emergencyNumber: {
        type: String
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
}, { timestamps: true });

// Auto-generate a sequential vendor code before saving
VendorSchema.pre('save', async function () {
    if (!this.vendorCode) {
        const count = await mongoose.model('Vendor').countDocuments();
        const seq = String(count + 1).padStart(4, '0');
        this.vendorCode = `VND-${seq}`;
    }
});

module.exports = mongoose.model('Vendor', VendorSchema);
