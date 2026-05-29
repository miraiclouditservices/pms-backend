const Notification = require('../models/Notification');

exports.getNotifications = async (req, res, next) => {
    try {
        let query = { user: req.user._id };
        
        if (req.query.markAsRead === 'true') {
            await Notification.updateMany({ user: req.user._id, readStatus: false }, { readStatus: true });
        }
        
        const data = await Notification.find(query).sort('-createdAt').limit(50);
        res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.markAsRead = async (req, res, next) => {
    try {
        const notification = await Notification.findByIdAndUpdate(
            req.params.id,
            { readStatus: true },
            { new: true }
        );
        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        res.status(200).json({ success: true, data: notification });
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
