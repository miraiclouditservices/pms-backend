const mongoose = require('mongoose');

const TicketCommentSchema = new mongoose.Schema({
    ticketId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Helpdesk',
        required: true
    },
    comment: {
        type: String,
        required: [true, 'Please add a comment']
    },
    commentBy: {
        type: String,
        required: true
    },
    commentRole: {
        type: String,
        required: true
    },
    attachment: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('TicketComment', TicketCommentSchema);
