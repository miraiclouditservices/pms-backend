const express = require('express');
const {
    getVisitors,
    getVisitor,
    createVisitor,
    updateVisitor,
    deleteVisitor
} = require('../controllers/visitors');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getVisitors)
    .post(authorize('Admin', 'Staff'), createVisitor);

router
    .route('/:id')
    .get(getVisitor)
    .put(authorize('Admin', 'Staff'), updateVisitor)
    .delete(authorize('Admin'), deleteVisitor);

module.exports = router;
