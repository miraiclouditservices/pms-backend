const mongoose = require('mongoose');

const UnitSchema = new mongoose.Schema({
    property: {
        type: mongoose.Schema.ObjectId,
        ref: 'Property',
        required: true
    },
    floor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Floor'
    },
    floorNumber: {
        type: String,
        required: [true, 'Please add a floor number']
    },
    unitNumber: {
        type: String,
        required: [true, 'Please add a unit number']
    },
    unitName: {
        type: String
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
        enum: ['Residential', 'Commercial', 'Office', 'IT', 'Retail', 'Standard', 'Premium', 'Cabin', 'Shared Workspace'],
        default: 'Standard'
    },
    unitStatus: {
        type: String,
        enum: ['Available', 'Occupied', 'Under Maintenance', 'Reserved'],
        default: 'Available'
    },
    tenant: {
        type: mongoose.Schema.ObjectId,
        ref: 'Tenant'
    },
    lease: {
        type: mongoose.Schema.ObjectId,
        ref: 'Lease'
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

// Call updatePropertyStats after save
UnitSchema.post('save', async function() {
    if (this.property) {
        await mongoose.model('Property').updatePropertyStats(this.property);
    }
    if (this.floor) {
        await mongoose.model('Floor').updateFloorStats(this.floor);
    }
});

// Call updatePropertyStats before remove
UnitSchema.post('deleteOne', { document: true, query: false }, async function() {
    if (this.property) {
        await mongoose.model('Property').updatePropertyStats(this.property);
    }
    if (this.floor) {
        await mongoose.model('Floor').updateFloorStats(this.floor);
    }
});

module.exports = mongoose.model('Unit', UnitSchema);
