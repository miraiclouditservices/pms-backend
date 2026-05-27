const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
    assetCode: {
        type: String,
        unique: true
    },
    assetDescription: {
        type: String,
        required: [true, 'Please add a description']
    },
    category: {
        type: String,
        enum: ['HVAC', 'Electrical', 'Plumbing', 'IT & Tech', 'Security', 'Furniture', 'Others'],
        default: 'Others'
    },
    property: {
        type: mongoose.Schema.ObjectId,
        ref: 'Property'
    },
    unit: {
        type: mongoose.Schema.ObjectId,
        ref: 'Unit'
    },
    floorNumber: {
        type: Number
    },
    assetLocation: {
        type: String,
        required: [true, 'Please add a location specific description']
    },
    serialNumber: {
        type: String
    },
    makeBrand: {
        type: String
    },
    purchaseDate: {
        type: Date
    },
    purchaseValue: {
        type: Number
    },
    warrantyStartDate: {
        type: Date
    },
    warrantyEndDate: {
        type: Date
    },
    amcStartDate: {
        type: Date
    },
    amcEndDate: {
        type: Date
    },
    vendorName: {
        type: String
    },
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Vendor'
    },
    contactName: {
        type: String
    },
    contactNumber: {
        type: String
    },
    assetStatus: {
        type: String,
        enum: ['Active', 'Under Repair', 'Scrapped'],
        default: 'Active'
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-generate asset code if not provided
AssetSchema.pre('save', async function() {
    if (!this.assetCode) {
        this.assetCode = 'AST-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
});

module.exports = mongoose.model('Asset', AssetSchema);
