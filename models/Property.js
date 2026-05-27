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
    monthlyRevenue: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }
});

// Static method to update property statistics
PropertySchema.statics.updatePropertyStats = async function(propertyId) {
    try {
        const property = await this.findById(propertyId);
        if (!property) return;

        const units = await mongoose.model('Unit').find({ property: propertyId });
        const leases = await mongoose.model('Lease').find({ property: propertyId, status: 'Active' });

        const occupiedSft = units.reduce((acc, unit) => acc + (unit.sqft || 0), 0);
        
        // availableSft is the defined totalSft minus occupiedSft
        const availableSft = property.totalSft - occupiedSft;
        const occupancyPercentage = property.totalSft === 0 ? 0 : Math.round((occupiedSft / property.totalSft) * 100);

        const monthlyRevenue = leases.reduce((acc, lease) => acc + (lease.monthlyRent || 0) + (lease.maintenanceCharges || 0), 0);

        await this.findByIdAndUpdate(propertyId, {
            occupiedSft,
            availableSft,
            occupancyPercentage,
            monthlyRevenue,
            occupancy: occupancyPercentage
        });
    } catch (err) {
        console.error('Error calculating property stats:', err);
    }
};

module.exports = mongoose.model('Property', PropertySchema);
