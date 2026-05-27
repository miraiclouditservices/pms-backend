const express = require('express');
const { getNotifications, createNotification } = require('../controllers/notifications');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getNotifications)
    .post(authorize('Super Admin', 'Staff Admin'), createNotification);

module.exports = router;