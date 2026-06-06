const express = require('express');
const { getTenants, getTenant, createTenant, updateTenant, deleteTenant } = require('../controllers/tenants');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getTenants)
    .post(authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER'), createTenant);

router.route('/:id')
    .get(getTenant)
    .put(authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER', 'Tenant'), updateTenant)
    .delete(authorize('SUPER_ADMIN'), deleteTenant);

module.exports = router;