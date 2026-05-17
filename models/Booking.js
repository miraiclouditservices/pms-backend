const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    bookingId: {
        type: String,
        unique: true
    },
    bookingParticulars: {
        type: String,
        required: [true, 'Please add booking particulars']
    },
    dateOfBooking: {
        type: Date,
        default: Date.now
    },
    timeOfBooking: {
        type: String
    },
    bookingFromDate: {
        type: Date,
        required: [true, 'Please add start date']
    },
    bookingToDate: {
        type: Date,
        required: [true, 'Please add end date']
    },
    paymentStatus: {
        type: String,
        enum: ['Paid', 'Pending'],
        default: 'Pending'
    },
    bookedBy: {
        type: String,
        required: [true, 'Please add booker name']
    },
    bookingStatus: {
        type: String,
        enum: ['Approved', 'Rejected', 'Pending'],
        default: 'Pending'
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
    
    if (!this.timeOfBooking) {
        this.timeOfBooking = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
});

module.exports = mongoose.model('Booking', BookingSchema);
