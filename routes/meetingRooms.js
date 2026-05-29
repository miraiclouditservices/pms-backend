const express = require('express');
const {
    getMeetingRooms,
    getMeetingRoom,
    createMeetingRoom,
    updateMeetingRoom,
    deleteMeetingRoom
} = require('../controllers/meetingRooms');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getMeetingRooms)
    .post(authorize('Super Admin', 'Floor Admin'), createMeetingRoom);

router
    .route('/:id')
    .get(getMeetingRoom)
    .put(authorize('Super Admin', 'Floor Admin'), updateMeetingRoom)
    .delete(authorize('Super Admin', 'Floor Admin'), deleteMeetingRoom);

module.exports = router;
