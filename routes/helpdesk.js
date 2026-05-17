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
    .post(authorize('Admin', 'Owner', 'Staff'), createTicket);

router
    .route('/:id')
    .get(getTicket)
    .put(authorize('Admin', 'Staff'), updateTicket)
    .delete(authorize('Admin'), deleteTicket);

module.exports = router;
