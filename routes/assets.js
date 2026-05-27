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
    .post(authorize('Super Admin', 'Admin'), createAsset);

router
    .route('/:id')
    .get(getAsset)
    .put(authorize('Super Admin', 'Admin'), updateAsset)
    .delete(authorize('Super Admin', 'Admin'), deleteAsset);

module.exports = router;
