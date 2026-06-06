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
        // Anyone who creates an account via the register route will become a SUPER_ADMIN.

        // 4. Create User
        // Whoever registers through this endpoint becomes a SUPER_ADMIN
        const user = await User.create({
            name,
            email,
            password,
            role: 'SUPER_ADMIN'
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
        const { email, password } = req.body; // DO NOT require role selection from frontend

        // Validate email & password
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide an email and password' });
        }

        // Check for user
        const user = await User.findOne({ email }).select('+password')
            .populate({
                path: 'assignedProperties',
                select: 'propertyName address propertyAddress'
            })
            .populate({
                path: 'assignedFloors',
                select: 'floorNumber floorName property'
            })
            .populate({
                path: 'assignedUnits',
                select: 'unitNumber unitType unitStatus sqft carParking bikeParking floor property',
                populate: [
                    { path: 'property', select: 'propertyName' },
                    { path: 'floor', select: 'floorName floorNumber' }
                ]
            });

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Check if account is active (fallback to true if field is missing)
        if (user.isActive === false || user.agreementStatus === 'Suspended') {
            return res.status(401).json({ success: false, error: 'Account is inactive' });
        }

        // Check if password matches
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Create token
        const token = user.getSignedJwtToken();

        // Normalize legacy database roles to ALL_CAPS for the frontend
        let responseRole = user.role;
        if (user.role === 'Super Admin' || user.role === 'SUPER_ADMIN') responseRole = 'SUPER_ADMIN';
        if (user.role === 'Office Owner' || user.role === 'OFFICE_OWNER') responseRole = 'OFFICE_OWNER';
        if (user.role === 'Floor Admin' || user.role === 'FLOOR_ADMIN') responseRole = 'FLOOR_ADMIN';
        if (user.role === 'Staff Admin' || user.role === 'STAFF_ADMIN') responseRole = 'STAFF_ADMIN';

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: responseRole,
                permissions: user.permissions || [],
                assignedProperties: user.assignedProperties || [],
                assignedFloors: user.assignedFloors || [],
                assignedUnits: user.assignedUnits || []
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.logout = async (req, res, next) => {
    res.status(200).json({
        success: true,
        message: 'Logout successful'
    });
};

exports.refreshToken = async (req, res, next) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, error: 'Token is required' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
        const user = await User.findById(decoded.id);
        if (!user || user.isActive === false) return res.status(401).json({ success: false, error: 'Invalid token or inactive user' });

        const newToken = user.getSignedJwtToken();
        res.status(200).json({ success: true, token: newToken });
    } catch (err) {
        res.status(401).json({ success: false, error: 'Invalid token' });
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

// Replaced getMe with profile route mapping
exports.getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id)
            .populate({
                path: 'assignedProperties',
                select: 'propertyName address propertyAddress'
            })
            .populate({
                path: 'assignedFloors',
                select: 'floorNumber floorName property'
            })
            .populate({
                path: 'assignedUnits',
                select: 'unitNumber unitType unitStatus sqft carParking bikeParking floor property',
                populate: [
                    { path: 'property', select: 'propertyName' },
                    { path: 'floor', select: 'floorName floorNumber' }
                ]
            });
        
        let responseRole = user.role;
        if (user.role === 'SUPER_ADMIN') responseRole = 'SUPER_ADMIN';
        if (user.role === 'OFFICE_OWNER') responseRole = 'OFFICE_OWNER';
        if (user.role === 'FLOOR_ADMIN') responseRole = 'FLOOR_ADMIN';
        if (user.role === 'STAFF_ADMIN') responseRole = 'STAFF_ADMIN';

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: responseRole,
                isActive: user.isActive !== false,
                permissions: user.permissions || [],
                assignedProperties: user.assignedProperties || [],
                assignedFloors: user.assignedFloors || [],
                assignedUnits: user.assignedUnits || [],
                createdAt: user.createdAt
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
