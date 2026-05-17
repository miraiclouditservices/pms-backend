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

        // 3. Authorization Logic
        if (userCount > 0) {
            // Require Admin token
            let token;
            if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
                token = req.headers.authorization.split(' ')[1];
            }

            if (!token) {
                return res.status(401).json({ success: false, error: 'Registration is restricted to Administrators. Please provide a valid token.' });
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const requester = await User.findById(decoded.id);

                if (!requester || requester.role !== 'Admin') {
                    return res.status(403).json({ success: false, error: 'Only Administrators can register new users.' });
                }
            } catch (err) {
                return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
            }
        }

        // 4. Create User
        // If first user, force Admin role. Otherwise use provided role or default to Staff.
        const user = await User.create({
            name,
            email,
            password,
            role: userCount === 0 ? 'Admin' : (role || 'Staff')
        });

        // 5. Response Logic
        // If first user, return token (auto-login). Otherwise just return user data.
        if (userCount === 0) {
            return sendTokenResponse(user, 201, res);
        }

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
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
        if (role && user.role !== role) {
            return res.status(401).json({ success: false, error: `Unauthorized: User is not registered as ${role}` });
        }

        // Check if password matches
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Additional check for Owners: Ensure they have an Owner profile
        if (user.role === 'Owner') {
            const Owner = require('../models/Owner');
            const ownerProfile = await Owner.findOne({ user: user._id });
            if (!ownerProfile) {
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
            role: user.role
        }
    });
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
