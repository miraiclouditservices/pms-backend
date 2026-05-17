const mongoose = require('mongoose');

const HelpdeskSchema = new mongoose.Schema({
    ticketNumber: {
        type: String,
        unique: true
    },
    natureOfComplaint: {
        type: String,
        required: [true, 'Please add nature of complaint']
    },
    complaintDescription: {
        type: String,
        required: [true, 'Please add a description']
    },
    dateOfComplaint: {
        type: Date,
        default: Date.now
    },
    timeOfComplaint: {
        type: String
    },
    allocatedTo: {
        type: String
    },
    escalated: {
        type: Boolean,
        default: false
    },
    resolvedDate: {
        type: Date
    },
    resolvedTime: {
        type: String
    },
    productiveHours: {
        type: Number // Storing as number for auto-calculation
    },
    status: {
        type: String,
        enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
        default: 'Open'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save to generate ticket number and set time
HelpdeskSchema.pre('save', async function () {
    if (!this.ticketNumber) {
        this.ticketNumber = 'TKT-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
    
    if (!this.timeOfComplaint) {
        this.timeOfComplaint = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
});

module.exports = mongoose.model('Helpdesk', HelpdeskSchema);
