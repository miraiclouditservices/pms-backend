const mongoose = require('mongoose');

const HelpdeskSchema = new mongoose.Schema({
    ticketId: {
        type: String,
        unique: true
    },
    title: {
        type: String,
        required: [true, 'Please add ticket title']
    },
    category: {
        type: String,
        enum: [
            'Maintenance',
            'Electricity',
            'Water',
            'Payment',
            'Agreement',
            'Security',
            'Technical Issue',
            'Complaint',
            'Other'
        ],
        required: [true, 'Please add a category']
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Critical'],
        required: [true, 'Please select a priority']
    },
    description: {
        type: String,
        required: [true, 'Please add a description']
    },
    attachment: {
        type: String
    },
    raisedBy: {
        type: String,
        required: true
    },
    raisedRole: {
        type: String,
        required: true
    },
    raisedUserId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
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
    unit: {
        type: mongoose.Schema.ObjectId,
        ref: 'Unit'
    },
    locationArea: {
        type: String
    },
    assignedTo: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    assignedRole: {
        type: String
    },
    assignedAt: {
        type: Date
    },
    status: {
        type: String,
        enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_RESPONSE', 'RESOLVED', 'CLOSED'],
        default: 'OPEN'
    },
    resolvedBy: {
        type: String
    },
    resolvedRole: {
        type: String
    },
    resolvedAt: {
        type: Date
    },
    resolutionNote: {
        type: String
    },
    updatedBy: {
        type: String
    },
    updatedRole: {
        type: String
    }
}, {
    timestamps: true
});

// Pre-save to generate ticketId
HelpdeskSchema.pre('save', async function () {
    if (!this.ticketId) {
        this.ticketId = 'TKT-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    }
});

module.exports = mongoose.model('Helpdesk', HelpdeskSchema);
