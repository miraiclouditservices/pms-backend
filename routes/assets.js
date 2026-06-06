const express = require('express');
const {
    getAssets,
    getAsset,
    createAsset,
    updateAsset,
    deleteAsset
} = require('../controllers/assets');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getAssets)
    .post(authorize('SUPER_ADMIN', 'Admin'), createAsset);

router
    .route('/:id')
    .get(getAsset)
    .put(authorize('SUPER_ADMIN', 'Admin'), updateAsset)
    .delete(authorize('SUPER_ADMIN', 'Admin'), deleteAsset);

module.exports = router;
