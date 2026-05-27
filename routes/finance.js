const express = require('express');
const { getInvoices, generateMonthlyInvoices, markAsPaid } = require('../controllers/finance');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect); // All finance routes are protected

router.route('/')
    .get(getInvoices);

router.route('/generate')
    .post(authorize('Super Admin'), generateMonthlyInvoices);

router.route('/:id/pay')
    .put(authorize('Super Admin', 'Floor Admin', 'Office Owner'), markAsPaid);

module.exports = router;