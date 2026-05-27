const mongoose = require('mongoose');

const LeaseSchema = new mongoose.Schema({
    tenantName: {
        type: String,
        required: [true, 'Please add tenant/lease holder name']
    },
    companyName: {
        type: String
    },
    tenantType: {
        type: String,
        enum: ['Individual', 'Company', 'Corporate'],
        default: 'Individual'
    },
    tenantContact: {
        type: String,
        required: [true, 'Please add contact number']
    },
    alternateContact: {
        type: String
    },
    tenantEmail: {
        type: String,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please add a valid email']
    },
    gstPan: {
        type: String
    },
    address: {
        type: String
    },
    emergencyContact: {
        type: String
    },
    remarks: {
        type: String
    },
    property: {
        type: mongoose.Schema.ObjectId,
        ref: 'Property',
        required: [true, 'Please link the property']
    },
    floor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Floor',
        required: [true, 'Please select the floor']
    },
    units: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Unit',
        required: [true, 'Please select at least one unit']
    }],
    allocatedSft: {
        type: Number,
        default: 0
    },
    assignedSft: {
        type: Number,
        default: 0
    },
    officeStatus: {
        type: String,
        enum: ['Vacant', 'Occupied', 'Reserved', 'Under Maintenance'],
        default: 'Vacant'
    },
    startDate: {
        type: Date,
        required: [true, 'Please add lease start date']
    },
    endDate: {
        type: Date,
        required: [true, 'Please add lease end date']
    },
    lockInPeriod: {
        type: Number,
        default: 6
    },
    status: {
        type: String,
        enum: ['Draft', 'Active', 'Expired', 'Terminated', 'Renewal Pending'],
        default: 'Active'
    },
    agreementUrl: {
        type: String
    },
    renewalReminderDays: {
        type: Number,
        default: 30
    },
    autoRenewal: {
        type: Boolean,
        default: false
    },
    noticePeriod: {
        type: Number,
        default: 3
    },
    rentPerSft: {
        type: Number,
        default: 0
    },
    camPerSft: {
        type: Number,
        default: 0
    },
    parkingCharges: {
        type: Number,
        default: 0
    },
    utilityCharges: {
        type: Number,
        default: 0
    },
    maintenanceCharges: {
        type: Number,
        default: 0
    },
    depositMonths: {
        type: Number,
        default: 2
    },
    escalationPercentage: {
        type: Number,
        default: 5
    },
    dueDay: {
        type: Number,
        default: 5,
        min: 1,
        max: 31
    },
    taxPercentage: {
        type: Number,
        default: 18
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    lateFeePercentage: {
        type: Number,
        default: 2
    },
    monthlyRent: {
        type: Number,
        required: [true, 'Please add monthly rent']
    },
    securityDeposit: {
        type: Number,
        default: 0
    },
    totalMonthlyAmount: {
        type: Number,
        default: 0
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    pendingAmount: {
        type: Number,
        default: 0
    },
    overdueAmount: {
        type: Number,
        default: 0
    },
    nextDueDate: {
        type: Date
    },
    paymentStatus: {
        type: String,
        enum: ['Paid', 'Partial', 'Pending', 'Overdue'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-update stats and status methods
LeaseSchema.post('save', async function() {
    if (this.property) {
        await mongoose.model('Property').updatePropertyStats(this.property);
    }
    if (this.floor) {
        await mongoose.model('Floor').updateFloorStats(this.floor);
    }
});

LeaseSchema.post('deleteOne', { document: true, query: false }, async function() {
    if (this.property) {
        await mongoose.model('Property').updatePropertyStats(this.property);
    }
    if (this.floor) {
        await mongoose.model('Floor').updateFloorStats(this.floor);
    }
});

module.exports = mongoose.model('Lease', LeaseSchema);
