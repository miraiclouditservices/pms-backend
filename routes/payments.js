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
router.use(authorize('Admin'));

router.route('/')
    .get(getPayments)
    .post(createPayment);

router.route('/:id')
    .put(updatePayment)
    .delete(deletePayment);

module.exports = router;
