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
    .post(authorize('Super Admin', 'Office Owner', 'Staff Admin'), createBooking);

router
    .route('/:id')
    .get(getBooking)
    .put(authorize('Super Admin', 'Office Owner', 'Staff Admin'), updateBooking)
    .delete(authorize('Super Admin'), deleteBooking);

module.exports = router;
