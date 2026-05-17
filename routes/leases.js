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
    .post(authorize('Admin'), createLease);

router
    .route('/:id')
    .get(getLease)
    .put(authorize('Admin'), updateLease)
    .delete(authorize('Admin'), deleteLease);

module.exports = router;
