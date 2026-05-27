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
    .post(authorize('Super Admin', 'Staff Admin'), createVendor);

router
    .route('/:id')
    .get(getVendor)
    .put(authorize('Super Admin', 'Staff Admin'), updateVendor)
    .delete(authorize('Super Admin'), deleteVendor);

module.exports = router;
