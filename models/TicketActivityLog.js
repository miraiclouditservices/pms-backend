const mongoose = require('mongoose');

const TicketActivityLogSchema = new mongoose.Schema({
    ticketId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Helpdesk',
        required: true
    },
    actionType: {
        type: String,
        required: true
    },
    oldValue: {
        type: String
    },
    newValue: {
        type: String
    },
    updatedBy: {
        type: String,
        required: true
    },
    updatedRole: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('TicketActivityLog', TicketActivityLogSchema);
