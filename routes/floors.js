
const express = require('express');
const { getFloors, getFloor, createFloor, updateFloor, deleteFloor } = require('../controllers/floors');
const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getFloors)
    .post(authorize('SUPER_ADMIN'), createFloor);

router.route('/:id')
    .get(getFloor)
    .put(authorize('SUPER_ADMIN'), updateFloor)
    .delete(authorize('SUPER_ADMIN'), deleteFloor);

module.exports = router;
