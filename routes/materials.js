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
    .post(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), createMaterial);

router
    .route('/:id')
    .get(getMaterial)
    .put(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), updateMaterial)
    .delete(authorize('SUPER_ADMIN'), deleteMaterial);

// Approve / Reject gate pass
router
    .route('/:id/approve')
    .patch(authorize('SUPER_ADMIN', 'STAFF_ADMIN', 'FLOOR_ADMIN', 'OFFICE_OWNER'), approveGatePass);

module.exports = router;
