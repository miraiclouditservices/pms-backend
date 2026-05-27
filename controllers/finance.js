const Finance = require('../models/Finance');
const Lease = require('../models/Lease');

exports.getInvoices = async (req, res, next) => {
    try {
        let query = {};
        if (req.user) {
            if (req.user.role === 'Office Owner' || req.user.role === 'Owner') {
                const owner = await require('mongoose').model('Owner').findOne({ user: req.user._id });
                if (!owner) return res.status(200).json({ success: true, count: 0, data: [] });
                const assignedFloors = await require('mongoose').model('Floor').find({ assignedOwner: owner._id });
                const floorIds = assignedFloors.map(f => f._id);
                query.floor = { $in: floorIds };
            } else if (req.user.role === 'Floor Admin') {
                const assignedFloors = await require('mongoose').model('Floor').find({ assignedAdmin: req.user._id });
                const floorIds = assignedFloors.map(f => f._id);
                query.floor = { $in: floorIds };
            } else if (req.user.role === 'Tenant') {
                const tenant = await require('mongoose').model('Tenant').findOne({ user: req.user._id });
                if (!tenant) return res.status(200).json({ success: true, count: 0, data: [] });
                query.lease = tenant.lease; // Tenant only sees invoices linked to their lease
            }
        }

        const invoices = await Finance.find(query)
            .populate('lease', 'tenantName status')
            .populate('property', 'propertyName')
            .sort('-createdAt');

        res.status(200).json({ success: true, count: invoices.length, data: invoices });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.generateMonthlyInvoices = async (req, res, next) => {
    try {
        const { month, year } = req.body;
        if (!month || !year) {
            return res.status(400).json({ success: false, error: 'Month and year are required' });
        }

        const activeLeases = await Lease.find({ status: 'Active' });
        let generatedCount = 0;

        for (const lease of activeLeases) {
            // Check if invoice already exists
            const existing = await Finance.findOne({ lease: lease._id, month, year });
            if (existing) continue;

            // Escalation Calculation (simplified: if lease is > 1 year old, apply escalation)
            const leaseStart = new Date(lease.startDate);
            const currentDate = new Date(`${month} 1, ${year}`);
            let rentAmount = lease.monthlyRent;
            
            if (lease.escalationPercentage && lease.escalationPercentage > 0) {
                const yearsPassed = currentDate.getFullYear() - leaseStart.getFullYear();
                if (yearsPassed >= 1) {
                    const escalationMultiplier = Math.pow(1 + (lease.escalationPercentage / 100), yearsPassed);
                    rentAmount = rentAmount * escalationMultiplier;
                }
            }

            const camAmount = lease.maintenanceCharges || 0;
            // GST Calculation (18% standard on commercial rent + CAM)
            const gstAmount = (rentAmount + camAmount) * 0.18;
            const totalAmount = rentAmount + camAmount + gstAmount;

            // Due Date Calculation
            const dueDay = lease.dueDay || 5;
            const dueDate = new Date(`${month} ${dueDay}, ${year}`);
            
            // Due Tracking / Alerts
            let status = 'Pending';
            if (new Date() > dueDate) {
                status = 'Overdue';
            }

            await Finance.create({
                invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                lease: lease._id,
                property: lease.property,
                floor: lease.floor,
                tenantName: lease.tenantName,
                month,
                year,
                rentAmount: Math.round(rentAmount),
                camAmount: Math.round(camAmount),
                gstAmount: Math.round(gstAmount),
                totalAmount: Math.round(totalAmount),
                dueDate,
                status
            });
            generatedCount++;
        }

        res.status(201).json({ success: true, message: `Successfully generated ${generatedCount} invoices for ${month} ${year}` });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.markAsPaid = async (req, res, next) => {
    try {
        const invoice = await Finance.findByIdAndUpdate(req.params.id, { status: 'Paid' }, { new: true });
        if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        res.status(200).json({ success: true, data: invoice });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
