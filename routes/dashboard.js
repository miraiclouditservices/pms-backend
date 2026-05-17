const express = require('express');
const { getMetrics } = require('../controllers/dashboard');

const router = express.Router();

const { protect } = require('../middleware/auth');

router.get('/metrics', protect, getMetrics);

module.exports = router;
