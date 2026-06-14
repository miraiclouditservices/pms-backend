const express = require('express');
const {
    getTickets,
    getTicket,
    createTicket,
    updateTicket,
    deleteTicket,
    getHelpdeskStats,
    assignTicket,
    updateTicketStatus,
    getComments,
    addComment,
    getActivityLogs
} = require('../controllers/helpdesk');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/stats', getHelpdeskStats);

router
    .route('/')
    .get(getTickets)
    .post(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'Tenant'), createTicket);

router
    .route('/:id')
    .get(getTicket)
    .put(authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'STAFF_ADMIN'), updateTicket)
    .delete(authorize('SUPER_ADMIN'), deleteTicket);

router.put('/:id/assign', authorize('SUPER_ADMIN', 'FLOOR_ADMIN'), assignTicket);
router.put('/:id/status', authorize('SUPER_ADMIN', 'FLOOR_ADMIN', 'STAFF_ADMIN'), updateTicketStatus);
router.route('/:id/comments')
    .get(getComments)
    .post(addComment);
router.get('/:id/logs', getActivityLogs);

module.exports = router;
