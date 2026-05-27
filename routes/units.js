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
    .post(authorize('Super Admin', 'Floor Admin'), createUnit);

router
    .route('/:id')
    .get(getUnit)
    .put(authorize('Super Admin', 'Floor Admin'), updateUnit)
    .delete(authorize('Super Admin', 'Floor Admin'), deleteUnit);

module.exports = router;
