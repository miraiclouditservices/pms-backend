const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    lease: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lease',
        required: [true, 'Payment must belong to a lease']
    },
    month: {
        type: String,
        required: [true, 'Please specify the month'],
        enum: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    },
    year: {
        type: Number,
        required: [true, 'Please specify the year']
    },
    amount: {
        type: Number,
        required: [true, 'Please specify the amount']
    },
    paymentDate: {
        type: Date,
        default: Date.now
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'Cheque', 'Online', 'Bank Transfer'],
        default: 'Online'
    },
    transactionId: String,
    status: {
        type: String,
        enum: ['Paid', 'Partial', 'Pending'],
        default: 'Paid'
    },
    remarks: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Prevent duplicate payments for the same month/year/lease
paymentSchema.index({ lease: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);
