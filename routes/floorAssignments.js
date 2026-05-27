const express = require('express');
const { getFloorAssignments, createFloorAssignment, deleteFloorAssignment } = require('../controllers/floorAssignments');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(authorize('Super Admin'));

router.route('/')
    .get(getFloorAssignments)
    .post(createFloorAssignment);

router.route('/:id')
    .delete(deleteFloorAssignment);

module.exports = router;