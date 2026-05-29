const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    bookingId: {
        type: String,
        unique: true
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
    meetingRoom: {
        type: mongoose.Schema.ObjectId,
        ref: 'MeetingRoom',
        required: [true, 'Please select a meeting room']
    },
    bookingDate: {
        type: Date,
        required: [true, 'Please select a booking date']
    },
    bookingFromDate: { 
        type: Date,
        required: [true, 'Please add start date']
    },
    bookingToDate: { 
        type: Date,
        required: [true, 'Please add end date']
    },
    startTime: {
        type: String,
        required: [true, 'Please specify start time']
    },
    endTime: {
        type: String,
        required: [true, 'Please specify end time']
    },
    bookedBy: {
        type: String,
        required: [true, 'Please add booker name']
    },
    bookedByUser: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    bookingParticulars: {
        type: String,
        required: [true, 'Please add booking particulars']
    },
    bookingStatus: {
        type: String,
        enum: ['Approved', 'Rejected', 'Pending'],
        default: 'Pending'
    },
    startNotificationSent: {
        type: Boolean,
        default: false
    },
    endNotificationSent: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save to generate booking ID
BookingSchema.pre('save', async function () {
    if (!this.bookingId) {
        this.bookingId = 'BKG-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
});

module.exports = mongoose.model('Booking', BookingSchema);
