const express = require('express');
const {
    getBookings,
    getBooking,
    createBooking,
    updateBooking,
    deleteBooking
} = require('../controllers/bookings');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getBookings)
    .post(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'STAFF_ADMIN'), createBooking);

router
    .route('/:id')
    .get(getBooking)
    .put(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'STAFF_ADMIN'), updateBooking)
    .delete(authorize('SUPER_ADMIN'), deleteBooking);

module.exports = router;
