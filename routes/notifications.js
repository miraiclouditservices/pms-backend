const express = require('express');
const { getNotifications, createNotification, markAsRead } = require('../controllers/notifications');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getNotifications)
    .post(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), createNotification);

router.put('/:id/read', markAsRead);

module.exports = router;