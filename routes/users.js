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

// All routes require login and Admin role
router.use(protect);
router.use(authorize('Admin'));

router
    .route('/')
    .get(getUsers)
    .post(createUser);

router
    .route('/:id')
    .get(getUser)
    .put(updateUser)
    .delete(deleteUser);

module.exports = router;
