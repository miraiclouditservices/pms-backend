const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name']
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    role: {
        type: String,
        enum: ['SUPER_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER', 'STAFF_ADMIN', 'Tenant'],
        default: 'STAFF_ADMIN'
    },
    staffCategory: {
        type: String,
        enum: ['Security', 'Watchman', 'Electrician', 'Plumber', 'Helpdesk', 'Gardener', 'Housekeeping', 'Supervisor', 'Other', 'None'],
        default: 'None'
    },
    permissions: [{
        type: String
    }],
    phoneNumber: {
        type: String
    },
    emergencyNumber: {
        type: String
    },
    address: {
        type: String
    },
    assignedProperties: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Property'
    }],
    assignedFloors: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Floor'
    }],
    assignedUnits: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Unit'
    }],
    companyName: {
        type: String
    },
    tenantType: {
        type: String,
        enum: ['Individual', 'Company', 'Corporate'],
        default: 'Individual'
    },
    gstPan: {
        type: String
    },
    floorAssignmentStartDate: {
        type: Date
    },
    floorAssignmentEndDate: {
        type: Date
    },
    monthlyManagementAmount: {
        type: Number,
        default: 0
    },
    paymentType: {
        type: String,
        enum: ['Monthly', 'Quarterly', 'Yearly'],
        default: 'Monthly'
    },
    paymentDueDay: {
        type: Number,
        default: 5
    },
    agreementStatus: {
        type: String,
        enum: ['Active', 'Pending', 'Expired', 'Suspended'],
        default: 'Active'
    },
    paymentStatus: {
        type: String,
        enum: ['Paid', 'Unpaid'],
        default: 'Unpaid'
    },
    idProofUrl: {
        type: String
    },
    remarks: {
        type: String
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: 6,
        select: false
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function () {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
