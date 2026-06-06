const express = require('express');
const {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    getUserBilling
} = require('../controllers/users');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Explicit routes requested by backend logic requirements
router.post('/create', authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN'), createUser);
router.put('/update/:id', authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN'), updateUser);
router.delete('/delete/:id', authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN'), deleteUser);
router.get('/list', authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN', 'STAFF_ADMIN'), getUsers);
router.get('/:id/billing', authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN', 'STAFF_ADMIN'), getUserBilling);

// Keep legacy root routes for backward compatibility
router
    .route('/')
    .get(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN', 'STAFF_ADMIN'), getUsers)
    .post(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN'), createUser);

router
    .route('/:id')
    .get(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN', 'STAFF_ADMIN'), getUser)
    .put(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN'), updateUser)
    .delete(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN'), deleteUser);

module.exports = router;
