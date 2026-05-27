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
    .post(authorize('Super Admin', 'Floor Admin', 'Office Owner'), createLease);

router
    .route('/:id')
    .get(getLease)
    .put(authorize('Super Admin', 'Floor Admin', 'Office Owner'), updateLease)
    .delete(authorize('Super Admin'), deleteLease);

module.exports = router;
