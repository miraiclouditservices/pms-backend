const mongoose = require('mongoose');

const VisitorSchema = new mongoose.Schema(
  {
    // ── Personal Information ──────────────────────────────────────────────────
    visitorName: {
      type: String,
      required: [true, 'Please add a visitor name'],
      trim: true,
    },
    visitorContactNumber: {
      type: String,
      required: [true, 'Please add a contact number'],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    idProofType: {
      type: String,
      enum: ['Aadhar', 'PAN', 'Driving License', 'Passport', 'Other'],
      default: 'Aadhar',
    },
    idNumber: {
      type: String,
      trim: true,
    },
    vehicleNumber: {
      type: String,
      trim: true,
    },
    visitorPhoto: {
      type: String, // URL or Base64
    },

    // ── Visit Details ─────────────────────────────────────────────────────────
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
    },
    floor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Floor',
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    },
    placeOfVisit: {
      type: String,
      trim: true,
    },
    personToMeet: {
      type: String,
      trim: true,
    },
    purposeOfVisit: {
      type: String,
      enum: ['Meeting', 'Delivery', 'Interview', 'Maintenance', 'Personal', 'Other'],
      default: 'Meeting',
    },
    visitDate: {
      type: String, // "YYYY-MM-DD"
      default: () => new Date().toISOString().split('T')[0],
    },
    inTime: {
      type: String, // "HH:mm"
      default: () =>
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    },
    outTime: {
      type: String,
    },
    outDate: {
      type: String, // "YYYY-MM-DD"
    },

    // ── Visit Status ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['Checked-In', 'Checked-Out'],
      default: 'Checked-In',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
    },
    // ── Hierarchy Approval Level ──────────────────────────────────────────────
    approvalLevel: {
      type: String,
      enum: ['Property Level', 'Floor Level', 'Office Level'],
      default: 'Property Level',
    },

    // ── Security & OTP ────────────────────────────────────────────────────────
    otp: {
      type: String,
    },
    otpExpiry: {
      type: Date,
    },
    qrCode: {
      type: String, // Base64 or URL
    },
    isBlacklisted: {
      type: Boolean,
      default: false,
    },

    // ── Metadata ──────────────────────────────────────────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast lookup by contact number and date
VisitorSchema.index({ visitorContactNumber: 1, visitDate: -1 });
VisitorSchema.index({ status: 1, visitDate: -1 });

module.exports = mongoose.model('Visitor', VisitorSchema);
