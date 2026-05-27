const mongoose = require('mongoose');

const FloorSchema = new mongoose.Schema({
    property: { type: mongoose.Schema.ObjectId, ref: 'Property', required: true },
    floorNumber: { type: String, required: true },
    floorName: { type: String },
    assignedOwner: { type: mongoose.Schema.ObjectId, ref: 'Owner' },
    assignedAdmin: { type: mongoose.Schema.ObjectId, ref: 'User' },
    totalUnits: { type: Number, default: 0 },
    totalSft: { type: Number, default: 0 },
    occupiedSft: { type: Number, default: 0 },
    availableSft: { type: Number, default: 0 },
    floorRevenue: { type: Number, default: 0 },
    status: { type: String, enum: ['Active', 'Maintenance'], default: 'Active' },
    createdAt: { type: Date, default: Date.now }
});

// Static method to update floor statistics
FloorSchema.statics.updateFloorStats = async function(floorId) {
    try {
        const floor = await this.findById(floorId);
        if (!floor) return;

        const units = await mongoose.model('Unit').find({ floor: floorId });
        const leases = await mongoose.model('Lease').find({ floor: floorId, status: 'Active' });

        const occupiedSft = units.reduce((acc, unit) => acc + (unit.sqft || 0), 0);
        
        // availableSft is the defined totalSft minus occupiedSft
        const availableSft = floor.totalSft - occupiedSft;
        
        const floorRevenue = leases.reduce((acc, lease) => acc + (lease.monthlyRent || 0) + (lease.maintenanceCharges || 0), 0);

        await this.findByIdAndUpdate(floorId, {
            occupiedSft,
            availableSft,
            floorRevenue
        });
    } catch (err) {
        console.error('Error calculating floor stats:', err);
    }
};

module.exports = mongoose.model('Floor', FloorSchema);