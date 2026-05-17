const express = require('express');
const {
    getMaterials,
    getMaterial,
    createMaterial,
    updateMaterial,
    deleteMaterial
} = require('../controllers/materials');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getMaterials)
    .post(authorize('Admin', 'Staff'), createMaterial);

router
    .route('/:id')
    .get(getMaterial)
    .put(authorize('Admin', 'Staff'), updateMaterial)
    .delete(authorize('Admin'), deleteMaterial);

module.exports = router;
