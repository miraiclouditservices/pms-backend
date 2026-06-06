const express = require('express');
const {
    getUnits,
    getUnit,
    createUnit,
    updateUnit,
    deleteUnit
} = require('../controllers/units');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getUnits)
    .post(authorize('SUPER_ADMIN', 'FLOOR_ADMIN'), createUnit);

router
    .route('/:id')
    .get(getUnit)
    .put(authorize('SUPER_ADMIN', 'FLOOR_ADMIN'), updateUnit)
    .delete(authorize('SUPER_ADMIN', 'FLOOR_ADMIN'), deleteUnit);

module.exports = router;
