const express = require('express');
const {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser
} = require('../controllers/users');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// GET all users — Super Admin and Floor Admin can view
router
    .route('/')
    .get(authorize('Super Admin', 'Floor Admin'), getUsers)
    .post(authorize('Super Admin', 'Floor Admin'), createUser);

// Single user operations — only Super Admin can update or delete
router
    .route('/:id')
    .get(authorize('Super Admin', 'Floor Admin'), getUser)
    .put(authorize('Super Admin'), updateUser)
    .delete(authorize('Super Admin'), deleteUser);

module.exports = router;
