const Helpdesk = require('../models/Helpdesk');
const TicketComment = require('../models/TicketComment');
const TicketActivityLog = require('../models/TicketActivityLog');
const User = require('../models/User');

// Helper to get scoped ticket query based on role
const getScopedQuery = async (user) => {
    let query = {};
    if (!user) return query;

    if (user.role === 'OFFICE_OWNER' || user.role === 'Tenant' || user.role === 'Owner') {
        query.$or = [
            { raisedUserId: user._id },
            { raisedBy: user.name }
        ];
    } else if (user.role === 'FLOOR_ADMIN') {
        const Floor = require('../models/Floor');
        const floors = await Floor.find({ assignedAdmin: user._id });
        const floorIds = floors.map(f => f._id);
        
        query.$or = [
            { floor: { $in: floorIds } },
            { assignedTo: user._id }
        ];
    } else if (user.role === 'STAFF_ADMIN') {
        query.assignedTo = user._id;
    }
    return query;
};

// @desc    Get all tickets
// @route   GET /api/helpdesk
// @access  Private
exports.getTickets = async (req, res, next) => {
    try {
        let query = await getScopedQuery(req.user);

        // 1. Search Query
        if (req.query.search && req.query.search.trim() !== '') {
            const searchRegex = new RegExp(req.query.search.trim(), 'i');
            const searchObj = {
                $or: [
                    { ticketId: searchRegex },
                    { title: searchRegex },
                    { description: searchRegex },
                    { category: searchRegex }
                ]
            };
            if (query.$or) {
                query = { $and: [ { $or: query.$or }, searchObj ] };
            } else {
                Object.assign(query, searchObj);
            }
        }

        // 2. Filters
        if (req.query.status && req.query.status !== 'All') {
            query.status = req.query.status;
        }
        if (req.query.priority && req.query.priority !== 'All') {
            query.priority = req.query.priority;
        }
        if (req.query.category && req.query.category !== 'All') {
            query.category = req.query.category;
        }
        if (req.query.property && req.query.property !== 'All') {
            query.property = req.query.property;
        }
        if (req.query.floor && req.query.floor !== 'All') {
            query.floor = req.query.floor;
        }

        // 3. Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;

        const total = await Helpdesk.countDocuments(query);

        const tickets = await Helpdesk.find(query)
            .populate('property', 'propertyName')
            .populate('floor', 'floorName floorNumber')
            .populate('unit', 'unitName unitNumber unitType')
            .populate('assignedTo', 'name email role')
            .sort('-createdAt')
            .skip(startIndex)
            .limit(limit);

        res.status(200).json({
            success: true,
            count: tickets.length,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            },
            data: tickets
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get single ticket
// @route   GET /api/helpdesk/:id
// @access  Private
exports.getTicket = async (req, res, next) => {
    try {
        const ticket = await Helpdesk.findById(req.params.id)
            .populate('property', 'propertyName')
            .populate('floor', 'floorName floorNumber')
            .populate('unit', 'unitName unitNumber unitType')
            .populate('assignedTo', 'name email role');

        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        res.status(200).json({ success: true, data: ticket });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create support ticket
// @route   POST /api/helpdesk
// @access  Private
exports.createTicket = async (req, res, next) => {
    try {
        req.body.raisedBy = req.user.name;
        req.body.raisedRole = req.user.role;
        req.body.raisedUserId = req.user._id;

        if (req.body.unit === '') {
            delete req.body.unit;
        }

        const ticket = await Helpdesk.create(req.body);

        // Log ticket creation
        await TicketActivityLog.create({
            ticketId: ticket._id,
            actionType: 'TICKET_CREATED',
            oldValue: null,
            newValue: 'OPEN',
            updatedBy: req.user.name,
            updatedRole: req.user.role
        });

        res.status(201).json({ success: true, data: ticket });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Assign support ticket
// @route   PUT /api/helpdesk/:id/assign
// @access  Private
exports.assignTicket = async (req, res, next) => {
    try {
        const ticket = await Helpdesk.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const assignUser = await User.findById(req.body.assignedTo);
        if (!assignUser) {
            return res.status(400).json({ success: false, error: 'User to assign not found' });
        }

        const oldAssignee = ticket.assignedTo ? (await User.findById(ticket.assignedTo))?.name || 'Unassigned' : 'Unassigned';

        ticket.assignedTo = assignUser._id;
        ticket.assignedRole = req.body.assignedRole || assignUser.role;
        ticket.assignedAt = Date.now();
        ticket.status = 'ASSIGNED';
        ticket.updatedBy = req.user.name;
        ticket.updatedRole = req.user.role;

        await ticket.save();

        // Log assignment
        await TicketActivityLog.create({
            ticketId: ticket._id,
            actionType: 'TICKET_ASSIGNED',
            oldValue: oldAssignee,
            newValue: assignUser.name,
            updatedBy: req.user.name,
            updatedRole: req.user.role
        });

        res.status(200).json({ success: true, data: ticket });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update support ticket status
// @route   PUT /api/helpdesk/:id/status
// @access  Private
exports.updateTicketStatus = async (req, res, next) => {
    try {
        const ticket = await Helpdesk.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const oldStatus = ticket.status;
        const newStatus = req.body.status;

        ticket.status = newStatus;
        ticket.updatedBy = req.user.name;
        ticket.updatedRole = req.user.role;

        if (newStatus === 'RESOLVED') {
            ticket.resolvedBy = req.user.name;
            ticket.resolvedRole = req.user.role;
            ticket.resolvedAt = Date.now();
            ticket.resolutionNote = req.body.resolutionNote || 'Resolved.';
        }

        await ticket.save();

        // Log status update
        await TicketActivityLog.create({
            ticketId: ticket._id,
            actionType: newStatus === 'RESOLVED' ? 'TICKET_RESOLVED' : 'STATUS_CHANGED',
            oldValue: oldStatus,
            newValue: newStatus,
            updatedBy: req.user.name,
            updatedRole: req.user.role,
            comment: newStatus === 'RESOLVED' ? req.body.resolutionNote : null
        });

        res.status(200).json({ success: true, data: ticket });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get ticket comments
// @route   GET /api/helpdesk/:id/comments
// @access  Private
exports.getComments = async (req, res, next) => {
    try {
        const comments = await TicketComment.find({ ticketId: req.params.id }).sort('createdAt');
        res.status(200).json({ success: true, data: comments });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Add comment to ticket
// @route   POST /api/helpdesk/:id/comments
// @access  Private
exports.addComment = async (req, res, next) => {
    try {
        const comment = await TicketComment.create({
            ticketId: req.params.id,
            comment: req.body.comment,
            commentBy: req.user.name,
            commentRole: req.user.role,
            attachment: req.body.attachment
        });

        res.status(201).json({ success: true, data: comment });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get ticket activity logs
// @route   GET /api/helpdesk/:id/logs
// @access  Private
exports.getActivityLogs = async (req, res, next) => {
    try {
        const logs = await TicketActivityLog.find({ ticketId: req.params.id }).sort('-createdAt');
        res.status(200).json({ success: true, data: logs });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Delete support ticket
// @route   DELETE /api/helpdesk/:id
// @access  Private
exports.deleteTicket = async (req, res, next) => {
    try {
        const ticket = await Helpdesk.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        await ticket.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get helpdesk stats
// @route   GET /api/helpdesk/stats
// @access  Private
exports.getHelpdeskStats = async (req, res, next) => {
    try {
        const query = await getScopedQuery(req.user);

        const total = await Helpdesk.countDocuments(query);
        const open = await Helpdesk.countDocuments({ ...query, status: 'OPEN' });
        const assigned = await Helpdesk.countDocuments({ ...query, status: 'ASSIGNED' });
        const inProgress = await Helpdesk.countDocuments({ ...query, status: 'IN_PROGRESS' });
        const waitingResponse = await Helpdesk.countDocuments({ ...query, status: 'WAITING_FOR_RESPONSE' });
        const resolved = await Helpdesk.countDocuments({ ...query, status: 'RESOLVED' });
        const closed = await Helpdesk.countDocuments({ ...query, status: 'CLOSED' });

        res.status(200).json({
            success: true,
            data: {
                total,
                open,
                assigned,
                inProgress,
                waitingResponse,
                resolved,
                closed
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Expose legacy updateTicket for factory/generic support if needed
exports.updateTicket = async (req, res, next) => {
    try {
        if (req.body.unit === '') {
            delete req.body.unit;
        }

        const ticket = await Helpdesk.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }
        res.status(200).json({ success: true, data: ticket });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
