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
    .post(authorize('Admin'), createAsset);

router
    .route('/:id')
    .get(getAsset)
    .put(authorize('Admin'), updateAsset)
    .delete(authorize('Admin'), deleteAsset);

module.exports = router;
