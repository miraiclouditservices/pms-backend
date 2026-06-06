const Booking = require('../models/Booking');
const User = require('../models/User');
const Notification = require('../models/Notification');

const runBookingScheduler = async () => {
    try {
        const now = new Date();
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

        // 1. Check bookings starting in 10 minutes
        const startingBookings = await Booking.find({
            bookingStatus: 'Approved',
            bookingFromDate: { $lte: tenMinutesFromNow, $gte: new Date(now.getTime() - 15 * 60 * 1000) },
            $or: [
                { startNotificationSent: false },
                { startNotificationSent: { $exists: false } }
            ]
        }).populate('meetingRoom');

        for (const booking of startingBookings) {
            const roomName = booking.meetingRoom ? booking.meetingRoom.roomName : 'Meeting Room';
            
            // Find FLOOR_ADMINs & OFFICE_OWNERs of that floor
            const floorAdmins = await User.find({ role: 'FLOOR_ADMIN', assignedFloors: booking.floor });
            const officeOwners = await User.find({ role: 'OFFICE_OWNER', assignedFloors: booking.floor });
            const bookerUser = booking.bookedByUser ? await User.findById(booking.bookedByUser) : null;

            const recipients = [...floorAdmins, ...officeOwners];
            if (bookerUser) recipients.push(bookerUser);
            
            const uniqueIds = Array.from(new Set(recipients.map(r => r._id.toString())));

            if (uniqueIds.length > 0) {
                const notifications = uniqueIds.map(userId => ({
                    user: userId,
                    title: '📢 Meeting Starts in 10 Mins',
                    message: `Meeting room "${roomName}" is booked by ${booking.bookedBy} starting at ${booking.startTime}.`,
                    type: 'Reminder'
                }));
                await Notification.insertMany(notifications);
            }

            booking.startNotificationSent = true;
            await booking.save();
        }

        // 2. Check bookings ending in 5 minutes
        const endingBookings = await Booking.find({
            bookingStatus: 'Approved',
            bookingToDate: { $lte: fiveMinutesFromNow, $gte: new Date(now.getTime() - 15 * 60 * 1000) },
            $or: [
                { endNotificationSent: false },
                { endNotificationSent: { $exists: false } }
            ]
        }).populate('meetingRoom');

        for (const booking of endingBookings) {
            const roomName = booking.meetingRoom ? booking.meetingRoom.roomName : 'Meeting Room';
            
            // Find FLOOR_ADMINs & OFFICE_OWNERs of that floor
            const floorAdmins = await User.find({ role: 'FLOOR_ADMIN', assignedFloors: booking.floor });
            const officeOwners = await User.find({ role: 'OFFICE_OWNER', assignedFloors: booking.floor });
            const bookerUser = booking.bookedByUser ? await User.findById(booking.bookedByUser) : null;

            const recipients = [...floorAdmins, ...officeOwners];
            if (bookerUser) recipients.push(bookerUser);
            
            const uniqueIds = Array.from(new Set(recipients.map(r => r._id.toString())));

            if (uniqueIds.length > 0) {
                const notifications = uniqueIds.map(userId => ({
                    user: userId,
                    title: '⏳ Meeting Ending in 5 Mins',
                    message: `Your booking for "${roomName}" will finish in 5 minutes (${booking.endTime}). Please wrap up your meeting.`,
                    type: 'Reminder'
                }));
                await Notification.insertMany(notifications);
            }

            booking.endNotificationSent = true;
            await booking.save();
        }
    } catch (err) {
        console.error('Error running booking scheduler:', err);
    }
};

module.exports = { runBookingScheduler };
