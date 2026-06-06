const express = require('express');
const {
    getLeases,
    getLease,
    createLease,
    updateLease,
    deleteLease
} = require('../controllers/leases');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getLeases)
    .post(authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER'), createLease);

router
    .route('/:id')
    .get(getLease)
    .put(authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER'), updateLease)
    .delete(authorize('SUPER_ADMIN'), deleteLease);

module.exports = router;
