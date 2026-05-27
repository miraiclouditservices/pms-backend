const express = require('express');
const {
    getMaterials,
    getMaterial,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    approveGatePass
} = require('../controllers/materials');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getMaterials)
    .post(authorize('Super Admin', 'Staff Admin'), createMaterial);

router
    .route('/:id')
    .get(getMaterial)
    .put(authorize('Super Admin', 'Staff Admin'), updateMaterial)
    .delete(authorize('Super Admin'), deleteMaterial);

// Approve / Reject gate pass
router
    .route('/:id/approve')
    .patch(authorize('Super Admin', 'Staff Admin', 'Floor Admin', 'Office Owner'), approveGatePass);

module.exports = router;
