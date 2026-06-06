const express = require('express');
const {
    getVendors,
    getVendor,
    createVendor,
    updateVendor,
    deleteVendor,
    getVendorStats
} = require('../controllers/vendors');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/stats')
    .get(getVendorStats);

router
    .route('/')
    .get(getVendors)
    .post(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), createVendor);

router
    .route('/:id')
    .get(getVendor)
    .put(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), updateVendor)
    .delete(authorize('SUPER_ADMIN'), deleteVendor);

module.exports = router;
