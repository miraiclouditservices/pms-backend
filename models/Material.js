const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema({
    // ── Gate Pass Info ────────────────────────────────────────────────────────
    gatePassType: {
        type: String,
        enum: ['Inward', 'Outward'],
        required: [true, 'Please specify gate pass type']
    },
    materialDetails: {
        type: String,
        required: [true, 'Please add material details']
    },
    hsnCode: { type: String },
    quantity: { type: Number, required: [true, 'Please add quantity'] },
    rate: { type: Number, required: [true, 'Please add rate'] },
    totalCost: { type: Number },

    // ── Location Hierarchy (ObjectId refs) ────────────────────────────────────
    property: { type: mongoose.Schema.ObjectId, ref: 'Property' },
    floor:    { type: mongoose.Schema.ObjectId, ref: 'Floor'    },
    unit:     { type: mongoose.Schema.ObjectId, ref: 'Unit'     },

    // ── Legacy string fields (kept for backward compat) ───────────────────────
    building:     { type: String },
    floorLabel:   { type: String },
    unitLabel:    { type: String },
    officeName:   { type: String },
    officeDetails:{ type: String },

    // ── Movement Details ──────────────────────────────────────────────────────
    placeOfVisit:   { type: String },
    purposeOfVisit: { type: String },
    vehicleNumber:  { type: String },
    inTime: {
        type: String,
        default: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    },
    outTime: { type: String },

    // ── Approval Flow ─────────────────────────────────────────────────────────
    approvalLevel: {
        type: String,
        enum: ['Property Level', 'Floor Level', 'Office Level'],
        default: 'Property Level'
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Cleared'],
        default: 'Pending'
    },
    approvedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String },

    // ── Metadata ──────────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

// Pre-save: auto-calculate total cost
MaterialSchema.pre('save', async function () {
    if (this.quantity && this.rate) {
        this.totalCost = this.quantity * this.rate;
    }
});

module.exports = mongoose.model('Material', MaterialSchema);
