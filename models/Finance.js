const mongoose = require('mongoose');

const FinanceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, unique: true },
    lease: { type: mongoose.Schema.ObjectId, ref: 'Lease', required: true },
    property: { type: mongoose.Schema.ObjectId, ref: 'Property' },
    floor: { type: mongoose.Schema.ObjectId, ref: 'Floor' },
    tenantName: { type: String },
    month: { type: String, required: true },
    year: { type: Number, required: true },
    rentAmount: { type: Number, default: 0 },
    camAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['Pending', 'Paid', 'Overdue'], default: 'Pending' },
    remarks: { type: String },
    createdAt: { type: Date, default: Date.now }
});

FinanceSchema.index({ lease: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Finance', FinanceSchema);