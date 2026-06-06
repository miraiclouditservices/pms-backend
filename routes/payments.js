const express = require('express');
const router = express.Router();
const {
    getPayments,
    createPayment,
    updatePayment,
    deletePayment
} = require('../controllers/payments');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getPayments)
    .post(authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER'), createPayment);

router.route('/:id')
    .put(authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER'), updatePayment)
    .delete(authorize('SUPER_ADMIN'), deletePayment);

module.exports = router;
