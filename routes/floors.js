
const express = require('express');
const { getFloors, getFloor, createFloor, updateFloor, deleteFloor } = require('../controllers/floors');
const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getFloors)
    .post(authorize('Super Admin'), createFloor);

router.route('/:id')
    .get(getFloor)
    .put(authorize('Super Admin'), updateFloor)
    .delete(authorize('Super Admin'), deleteFloor);

module.exports = router;
