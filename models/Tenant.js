const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.ObjectId, ref: 'User' },
    lease: { type: mongoose.Schema.ObjectId, ref: 'Lease' },
    tenantName: { type: String, required: true },
    contactNumber: { type: String, required: true },
    emailId: { type: String },
    companyName: { type: String },
    kycDocuments: [{ 
        docType: { type: String, enum: ['ID Proof', 'Address Proof', 'Company Registration', 'GST Certificate', 'Other'] },
        name: String, 
        url: String,
        verified: { type: Boolean, default: false }
    }],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tenant', TenantSchema);