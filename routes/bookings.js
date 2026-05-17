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
    .post(authorize('Admin', 'Owner'), createBooking);

router
    .route('/:id')
    .get(getBooking)
    .put(authorize('Admin', 'Owner'), updateBooking)
    .delete(authorize('Admin'), deleteBooking);

module.exports = router;
