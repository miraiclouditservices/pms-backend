const express = require('express');
const { getInvoices, generateMonthlyInvoices, markAsPaid } = require('../controllers/finance');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect); // All finance routes are protected

router.route('/')
    .get(getInvoices);

router.route('/generate')
    .post(authorize('SUPER_ADMIN'), generateMonthlyInvoices);

router.route('/:id/pay')
    .put(authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER'), markAsPaid);

module.exports = router;