const mongoose = require('mongoose');

const VisitorSchema = new mongoose.Schema({
    visitorName: {
        type: String,
        required: [true, 'Please add a visitor name']
    },
    visitorContactNumber: {
        type: String,
        required: [true, 'Please add a contact number']
    },
    address: {
        type: String
    },
    placeOfVisit: {
        type: String,
        required: [true, 'Please add place of visit']
    },
    purposeOfVisit: {
        type: String
    },
    idParticulars: {
        type: String
    },
    vehicleNumber: {
        type: String
    },
    inTime: {
        type: String, // Storing as string "HH:mm" as per "Time" type request
        default: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    },
    outTime: {
        type: String
    },
    visitorPhoto: {
        type: String // URL or Base64
    },
    status: {
        type: String,
        enum: ['IN', 'OUT'],
        default: 'IN'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Visitor', VisitorSchema);
