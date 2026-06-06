const express = require('express');
const {
    getTickets,
    getTicket,
    createTicket,
    updateTicket,
    deleteTicket,
    getHelpdeskStats
} = require('../controllers/helpdesk');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/stats', getHelpdeskStats);

router
    .route('/')
    .get(getTickets)
    .post(authorize('SUPER_ADMIN', 'OFFICE_OWNER', 'STAFF_ADMIN', 'Tenant'), createTicket);

router
    .route('/:id')
    .get(getTicket)
    .put(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), updateTicket)
    .delete(authorize('SUPER_ADMIN'), deleteTicket);

module.exports = router;
