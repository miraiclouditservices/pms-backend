const express = require('express');
const {
    getVisitors, getVisitor, createVisitor, updateVisitor, deleteVisitor,
    approveVisitor, rejectVisitor, checkInVisitor, checkOutVisitor, getVisitorStats,
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
        authorize('Super Admin', 'Staff Admin', 'Office Owner', 'Floor Admin'),
        createVisitor
    );

router.route('/:id')
    .get(getVisitor)
    .put(authorize('Super Admin', 'Staff Admin'), updateVisitor)
    .delete(authorize('Super Admin'), deleteVisitor);

// ── Approval Flow ─────────────────────────────────────────────────────────────
router.patch('/:id/approve',
    authorize('Super Admin', 'Staff Admin', 'Office Owner', 'Floor Admin'),
    approveVisitor
);
router.patch('/:id/reject',
    authorize('Super Admin', 'Staff Admin', 'Office Owner', 'Floor Admin'),
    rejectVisitor
);

// ── Security/Watchman Gate Actions ────────────────────────────────────────────
router.patch('/:id/check-in',
    authorize('Super Admin', 'Staff Admin', 'Watchman', 'Security'),
    checkInVisitor
);
router.patch('/:id/check-out',
    authorize('Super Admin', 'Staff Admin', 'Watchman', 'Security'),
    checkOutVisitor
);

module.exports = router;
