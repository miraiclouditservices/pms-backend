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
    .post(authorize('Admin'), createUnit);

router
    .route('/:id')
    .get(getUnit)
    .put(authorize('Admin'), updateUnit)
    .delete(authorize('Admin'), deleteUnit);

module.exports = router;
