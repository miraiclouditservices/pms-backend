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
    .post(authorize('Super Admin', 'Office Owner', 'Staff Admin', 'Tenant'), createTicket);

router
    .route('/:id')
    .get(getTicket)
    .put(authorize('Super Admin', 'Staff Admin'), updateTicket)
    .delete(authorize('Super Admin'), deleteTicket);

module.exports = router;
