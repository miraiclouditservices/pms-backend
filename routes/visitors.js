const express = require('express');
const {
    getVisitors, getVisitor, createVisitor, updateVisitor, deleteVisitor,
    checkInVisitor, checkOutVisitor, getVisitorStats,
} = require('../controllers/visitors');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', getVisitorStats);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.route('/')
    .get(getVisitors)
    .post(
        authorize('SUPER_ADMIN', 'STAFF_ADMIN', 'OFFICE_OWNER', 'FLOOR_ADMIN'),
        createVisitor
    );

router.route('/:id')
    .get(getVisitor)
    .put(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), updateVisitor)
    .delete(authorize('SUPER_ADMIN'), deleteVisitor);

// ── Security/Watchman Gate Actions ────────────────────────────────────────────
router.patch('/:id/check-in',
    authorize('SUPER_ADMIN', 'STAFF_ADMIN', 'Watchman', 'Security'),
    checkInVisitor
);
router.patch('/:id/check-out',
    authorize('SUPER_ADMIN', 'STAFF_ADMIN', 'Watchman', 'Security'),
    checkOutVisitor
);

module.exports = router;
