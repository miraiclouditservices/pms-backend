const express = require('express');
const { getTenants, getTenant, createTenant, updateTenant, deleteTenant } = require('../controllers/tenants');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getTenants)
    .post(authorize('Super Admin', 'Floor Admin', 'Office Owner'), createTenant);

router.route('/:id')
    .get(getTenant)
    .put(authorize('Super Admin', 'Floor Admin', 'Office Owner', 'Tenant'), updateTenant)
    .delete(authorize('Super Admin'), deleteTenant);

module.exports = router;