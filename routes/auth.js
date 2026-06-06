const express = require('express');
const { register, login, logout, refreshToken, getProfile } = require('../controllers/auth');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);
router.get('/profile', protect, getProfile);

// Keep legacy /me just in case frontend relies on it elsewhere
router.get('/me', protect, getProfile);

module.exports = router;
