const Booking = require('../models/Booking');
const factory = require('./factory');

exports.getBookings = async (req, res, next) => {
    try {
        let query = {};
        
        if (req.user && (req.user.role === 'Owner' || req.user.role === 'Office Owner')) {
            const userName = req.user.name || "";
            const companyName = req.user.companyName || "";
            
            query = {
                $or: [
                    { bookedBy: { $regex: new RegExp(userName, 'i') } },
                    { bookingParticulars: { $regex: new RegExp(companyName, 'i') } }
                ]
            };
        } else if (req.user && req.user.role === 'Floor Admin') {
            const userName = req.user.name || "";
            query = { bookedBy: { $regex: new RegExp(userName, 'i') } };
        }
        
        const data = await Booking.find(query).sort('-createdAt');
        res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
exports.getBooking = factory.getOne(Booking);
exports.createBooking = factory.createOne(Booking);
exports.updateBooking = factory.updateOne(Booking);
exports.deleteBooking = factory.deleteOne(Booking);
