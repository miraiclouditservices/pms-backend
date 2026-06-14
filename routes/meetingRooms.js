const express = require('express');
const {
    getMeetingRooms,
    getMeetingRoom,
    createMeetingRoom,
    updateMeetingRoom
} = require('../controllers/meetingRooms');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getMeetingRooms)
    .post(authorize('SUPER_ADMIN', 'FLOOR_ADMIN'), createMeetingRoom);

router
    .route('/:id')
    .get(getMeetingRoom)
    .put(authorize('SUPER_ADMIN', 'FLOOR_ADMIN'), updateMeetingRoom);

module.exports = router;
