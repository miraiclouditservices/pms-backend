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
        // Find Floor Admins of the floor
        const floorAdmins = await User.find({
            role: 'Floor Admin',
            assignedFloors: booking.floor
        });

        // Find Office Owners on the same floor
        const officeOwners = await User.find({
            role: 'Office Owner',
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
        if (req.user && req.user.role === 'Floor Admin') {
            query.floor = { $in: req.user.assignedFloors || [] };
        } else if (req.user && (req.user.role === 'Office Owner' || req.user.role === 'Tenant')) {
            query.floor = { $in: req.user.assignedFloors || [] };
        }

        if (req.query.meetingRoom) {
            query.meetingRoom = req.query.meetingRoom;
        }

        const data = await Booking.find(query)
            .populate('property', 'propertyName')
            .populate('floor', 'floorNumber floorName')
            .populate('meetingRoom', 'roomName sqft capacity')
            .sort('-createdAt');

        res.status(200).json({ success: true, count: data.length, data });
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
