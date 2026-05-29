const mongoose = require('mongoose');

const MeetingRoomSchema = new mongoose.Schema({
    property: {
        type: mongoose.Schema.ObjectId,
        ref: 'Property',
        required: [true, 'Please select a property']
    },
    floor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Floor',
        required: [true, 'Please select a floor']
    },
    roomName: {
        type: String,
        required: [true, 'Please add a meeting room/hall name']
    },
    sqft: {
        type: Number,
        required: [true, 'Please specify the space size in SFT']
    },
    capacity: {
        type: Number,
        default: 10
    },
    status: {
        type: String,
        enum: ['Available', 'Under Maintenance'],
        default: 'Available'
    },
    unit: {
        type: mongoose.Schema.ObjectId,
        ref: 'Unit'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Calculate and validate stats on floor if needed
MeetingRoomSchema.post('save', async function() {
    if (this.floor) {
        await mongoose.model('Floor').updateFloorStats(this.floor);
    }
});

MeetingRoomSchema.post('deleteOne', { document: true, query: false }, async function() {
    if (this.floor) {
        await mongoose.model('Floor').updateFloorStats(this.floor);
    }
});

module.exports = mongoose.model('MeetingRoom', MeetingRoomSchema);
