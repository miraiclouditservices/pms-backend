const Notification = require('../models/Notification');

exports.getNotifications = async (req, res, next) => {
    try {
        let query = {};
        if (req.user && req.user.role === 'Tenant') {
            const tenant = await require('mongoose').model('Tenant').findOne({ user: req.user._id });
            if (tenant) {
                query.recipient = tenant._id;
            }
        } else if (req.user && req.user.role === 'Office Owner') {
            const owner = await require('mongoose').model('Owner').findOne({ user: req.user._id });
            if (owner) {
                query.recipient = owner._id;
            }
        }
        
        const data = await Notification.find(query).sort('-createdAt');
        res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createNotification = async (req, res, next) => {
    try {
        const data = await Notification.create(req.body);
        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
