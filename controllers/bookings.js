const Booking = require('../models/Booking');
const MeetingRoom = require('../models/MeetingRoom');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Helper to convert "HH:MM" to minutes
const toMinutes = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

// Helper to send system notifications
const sendBookingNotification = async (booking, title, message) => {
    try {
        // Find FLOOR_ADMINs of the floor
        const floorAdmins = await User.find({
            role: 'FLOOR_ADMIN',
            assignedFloors: booking.floor
        });

        // Find OFFICE_OWNERs on the same floor
        const officeOwners = await User.find({
            role: 'OFFICE_OWNER',
            assignedFloors: booking.floor
        });

        // Find the user who booked it
        const bookerUser = booking.bookedByUser ? await User.findById(booking.bookedByUser) : null;

        // Combine
        const recipients = [...floorAdmins, ...officeOwners];
        if (bookerUser) recipients.push(bookerUser);

        const uniqueIds = Array.from(new Set(recipients.map(r => r._id.toString())));

        if (uniqueIds.length > 0) {
            const notifications = uniqueIds.map(userId => ({
                user: userId,
                title,
                message,
                type: 'Info'
            }));
            await Notification.insertMany(notifications);
        }
    } catch (err) {
        console.error('Failed to send booking notifications:', err);
    }
};

// @desc    Get all bookings
// @route   GET /api/bookings
// @access  Private
exports.getBookings = async (req, res, next) => {
    try {
        let query = {};
        
        // Role-based visibility
        if (req.user && req.user.role === 'FLOOR_ADMIN') {
            query.floor = { $in: req.user.assignedFloors || [] };
        } else if (req.user && (req.user.role === 'OFFICE_OWNER' || req.user.role === 'Tenant')) {
            query.floor = { $in: req.user.assignedFloors || [] };
        } else if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = req.user.assignedProperties || [];
            const assignedFloors = req.user.assignedFloors || [];
            if (assignedProps.length === 0 && assignedFloors.length === 0) {
                return res.status(200).json({ success: true, total: 0, pages: 0, count: 0, data: [] });
            }
            query.$or = [];
            if (assignedProps.length > 0) {
                query.$or.push({ property: { $in: assignedProps } });
            }
            if (assignedFloors.length > 0) {
                query.$or.push({ floor: { $in: assignedFloors } });
            }
        }

        // Apply filters
        if (req.query.property) {
            query.property = req.query.property;
        }
        if (req.query.floor) {
            query.floor = req.query.floor;
        }
        if (req.query.meetingRoom) {
            query.meetingRoom = req.query.meetingRoom;
        }

        // Apply search
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            
            // Find meeting rooms matching roomName
            const rooms = await MeetingRoom.find({ roomName: searchRegex }).select('_id');
            const roomIds = rooms.map(r => r._id);

            const searchConditions = [
                { bookingId: searchRegex },
                { bookedBy: searchRegex },
                { bookingParticulars: searchRegex },
                { meetingRoom: { $in: roomIds } }
            ];

            if (query.$or) {
                query = { $and: [ { $or: query.$or }, { $or: searchConditions } ] };
            } else {
                query.$or = searchConditions;
            }
        }

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const total = await Booking.countDocuments(query);
        const pages = Math.ceil(total / limit);

        const data = await Booking.find(query)
            .populate('property', 'propertyName')
            .populate('floor', 'floorNumber floorName')
            .populate('meetingRoom', 'roomName sqft capacity')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            total,
            pages,
            count: data.length,
            data
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
exports.getBooking = async (req, res, next) => {
    try {
        const data = await Booking.findById(req.params.id)
            .populate('property', 'propertyName')
            .populate('floor', 'floorNumber floorName')
            .populate('meetingRoom', 'roomName sqft capacity');

        if (!data) {
            return res.status(404).json({ success: false, error: 'Booking not found' });
        }

        if (req.user && req.user.role === 'STAFF_ADMIN') {
            const assignedProps = (req.user.assignedProperties || []).map(id => id.toString());
            const assignedFloors = (req.user.assignedFloors || []).map(id => id.toString());
            const isPropAssigned = assignedProps.includes(data.property?._id?.toString() || data.property?.toString());
            const isFloorAssigned = assignedFloors.includes(data.floor?._id?.toString() || data.floor?.toString());
            if (!isPropAssigned && !isFloorAssigned) {
                return res.status(403).json({ success: false, error: 'Not authorized to access this booking' });
            }
        }

        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create a booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res, next) => {
    try {
        const { meetingRoom, bookingDate, startTime, endTime } = req.body;

        // Check if meeting room exists
        const room = await MeetingRoom.findById(meetingRoom);
        if (!room) {
            return res.status(404).json({ success: false, error: 'Meeting room not found' });
        }

        // Fill property and floor from the meeting room structure
        req.body.property = room.property;
        req.body.floor = room.floor;
        req.body.bookedByUser = req.user._id;
        req.body.bookedBy = req.user.name || req.user.email || 'System';
        req.body.bookingStatus = 'Approved';

        // Convert string dates
        const dateObj = new Date(bookingDate);
        req.body.bookingDate = dateObj;
        
        // Formulate bookingFromDate & bookingToDate (DateTime compatibility)
        const [startH, startM] = startTime.split(':').map(Number);
        const fromDate = new Date(bookingDate);
        fromDate.setHours(startH, startM, 0, 0);
        req.body.bookingFromDate = fromDate;

        const [endH, endM] = endTime.split(':').map(Number);
        const toDate = new Date(bookingDate);
        toDate.setHours(endH, endM, 0, 0);
        req.body.bookingToDate = toDate;

        // Time slot validations
        const newStart = toMinutes(startTime);
        const newEnd = toMinutes(endTime);

        if (newStart >= newEnd) {
            return res.status(400).json({ success: false, error: 'Start time must be before end time' });
        }

        // Check conflicts (only check Approved bookings)
        const bookingDateStart = new Date(bookingDate);
        bookingDateStart.setHours(0, 0, 0, 0);
        const bookingDateEnd = new Date(bookingDate);
        bookingDateEnd.setHours(23, 59, 59, 999);

        const conflicts = await Booking.find({
            meetingRoom: meetingRoom,
            bookingStatus: 'Approved',
            bookingDate: { $gte: bookingDateStart, $lte: bookingDateEnd }
        });

        for (const conflict of conflicts) {
            const confStart = toMinutes(conflict.startTime);
            const confEnd = toMinutes(conflict.endTime);

            if (newStart < confEnd && newEnd > confStart) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Slot conflict: Room is already booked from ${conflict.startTime} to ${conflict.endTime}` 
                });
            }
        }

        const data = await Booking.create(req.body);

        // Send alert
        await sendBookingNotification(
            data,
            'New Meeting Room Booking',
            `A new booking has been scheduled for Room: ${room.roomName} on ${dateObj.toLocaleDateString('en-GB')} at ${startTime}-${endTime}.`
        );

        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update a booking
// @route   PUT /api/bookings/:id
// @access  Private
exports.updateBooking = async (req, res, next) => {
    try {
        let booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Booking not found' });
        }

        const { startTime, endTime, bookingDate, bookingStatus } = req.body;

        // If time slots are changing, validate conflicts
        const targetStartTime = startTime || booking.startTime;
        const targetEndTime = endTime || booking.endTime;
        const targetBookingDate = bookingDate ? new Date(bookingDate) : booking.bookingDate;

        const newStart = toMinutes(targetStartTime);
        const newEnd = toMinutes(targetEndTime);

        if (newStart >= newEnd) {
            return res.status(400).json({ success: false, error: 'Start time must be before end time' });
        }

        // If status is being set to Approved, check for conflicts
        if (bookingStatus === 'Approved' || (booking.bookingStatus === 'Approved' && (startTime || endTime || bookingDate))) {
            const bookingDateStart = new Date(targetBookingDate);
            bookingDateStart.setHours(0, 0, 0, 0);
            const bookingDateEnd = new Date(targetBookingDate);
            bookingDateEnd.setHours(23, 59, 59, 999);

            const conflicts = await Booking.find({
                meetingRoom: booking.meetingRoom,
                bookingStatus: 'Approved',
                _id: { $ne: booking._id },
                bookingDate: { $gte: bookingDateStart, $lte: bookingDateEnd }
            });

            for (const conflict of conflicts) {
                const confStart = toMinutes(conflict.startTime);
                const confEnd = toMinutes(conflict.endTime);

                if (newStart < confEnd && newEnd > confStart) {
                    return res.status(400).json({ 
                        success: false, 
                        error: `Slot conflict: Room is already booked from ${conflict.startTime} to ${conflict.endTime}` 
                    });
                }
            }
        }

        // If changing date or times, sync bookingFromDate / bookingToDate
        if (bookingDate || startTime || endTime) {
            const dateVal = bookingDate ? new Date(bookingDate) : booking.bookingDate;
            
            const [startH, startM] = targetStartTime.split(':').map(Number);
            const fromDate = new Date(dateVal);
            fromDate.setHours(startH, startM, 0, 0);
            req.body.bookingFromDate = fromDate;

            const [endH, endM] = targetEndTime.split(':').map(Number);
            const toDate = new Date(dateVal);
            toDate.setHours(endH, endM, 0, 0);
            req.body.bookingToDate = toDate;
        }

        const data = await Booking.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Trigger status notification
        if (bookingStatus && bookingStatus !== booking.bookingStatus) {
            const room = await MeetingRoom.findById(booking.meetingRoom);
            const roomName = room ? room.roomName : 'Meeting Room';
            await sendBookingNotification(
                data,
                `Booking Status Update: ${bookingStatus}`,
                `Booking request for ${roomName} on ${data.bookingDate.toLocaleDateString('en-GB')} has been ${bookingStatus.toLowerCase()}.`
            );
        }

        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Delete a booking
// @route   DELETE /api/bookings/:id
// @access  Private
exports.deleteBooking = async (req, res, next) => {
    try {
        const data = await Booking.findById(req.params.id);
        if (!data) {
            return res.status(404).json({ success: false, error: 'Booking not found' });
        }

        await data.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
