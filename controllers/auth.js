const jwt = require('jsonwebtoken');
const User = require('../models/User');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public (only for first user) / Private Admin
exports.register = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;

        // 1. Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, error: 'User already exists' });
        }

        // 2. Check current user count
        const userCount = await User.countDocuments();

        // 3. Authorization Logic (Bypassed per user request)
        // Anyone who creates an account via the register route will become a Super Admin.

        // 4. Create User
        // Whoever registers through this endpoint becomes a Super Admin
        const user = await User.create({
            name,
            email,
            password,
            role: 'Super Admin'
        });

        // 5. Response Logic
        // Always return token (auto-login) since they are registering themselves
        return sendTokenResponse(user, 201, res);
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
        const { email, password, role } = req.body;

        // Validate email & password
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide an email and password' });
        }

        // Check for user
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Check if role matches if provided (for tab-based login verification)
        // Super Admin can bypass any tab check
        if (role && user.role !== role && user.role !== 'Super Admin') {
            return res.status(401).json({ success: false, error: `Unauthorized: User is not registered as ${role}` });
        }

        // Check if password matches
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Additional check for Owners: Ensure they have an Owner profile
        if (role === 'Office Owner' || user.role === 'Office Owner') {
            const Owner = require('../models/Owner');
            const ownerProfile = await Owner.findOne({ user: user._id });
            if (!ownerProfile && user.role !== 'Super Admin') {
                return res.status(403).json({ success: false, error: 'Owner profile not found. Please contact support.' });
            }
        }

        sendTokenResponse(user, 200, res);
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
    // Create token
    const token = user.getSignedJwtToken();

    res.status(statusCode).json({
        success: true,
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            permissions: user.permissions || []
        }
    });
};

exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('assignedProperties')
            .populate('assignedFloors')
            .populate({
                path: 'assignedUnits',
                populate: [
                    { path: 'property' },
                    { path: 'floor' }
                ]
            });

        let ownerProfile = null;
        let activeLeases = [];
        
        if (user.role === 'Owner' || user.role === 'Office Owner') {
            const Owner = require('../models/Owner');
            ownerProfile = await Owner.findOne({ user: user._id })
                .populate({
                    path: 'unitsAssigned',
                    populate: [
                        { path: 'property' },
                        { path: 'floor' }
                    ]
                });
        }

        if (user.assignedUnits && user.assignedUnits.length > 0) {
            const Lease = require('../models/Lease');
            activeLeases = await Lease.find({ units: { $in: user.assignedUnits } })
                .populate('property')
                .populate('floor')
                .populate('units');
        }

        res.status(200).json({
            success: true,
            data: user,
            ownerProfile,
            activeLeases
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
