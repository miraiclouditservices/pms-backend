const Payment = require('../models/Payment');
const Lease = require('../models/Lease');

exports.getPayments = async (req, res, next) => {
    try {
        const query = req.query.lease ? { lease: req.query.lease } : {};
        const payments = await Payment.find(query).sort({ year: -1, month: -1 });

        res.status(200).json({
            success: true,
            data: payments
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createPayment = async (req, res, next) => {
    try {
        const payment = await Payment.create(req.body);

        res.status(201).json({
            success: true,
            data: payment
        });
    } catch (err) {
        // Handle duplicate index error
        if (err.code === 11000) {
            return res.status(400).json({ 
                success: false, 
                error: 'Payment for this month and year already exists for this lease.' 
            });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updatePayment = async (req, res, next) => {
    try {
        const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment record not found' });
        }

        res.status(200).json({
            success: true,
            data: payment
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deletePayment = async (req, res, next) => {
    try {
        const payment = await Payment.findByIdAndDelete(req.params.id);

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment record not found' });
        }

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
