const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB().then(() => {
    try {
        const { runLeaseAutomation } = require('./config/leaseAutomation');
        // Run once on boot, then every 24 hours
        runLeaseAutomation();
        setInterval(runLeaseAutomation, 24 * 60 * 60 * 1000);
    } catch (e) {
        console.error('Lease automation startup error:', e);
    }
});

const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/floors', require('./routes/floors'));
app.use('/api/units', require('./routes/units'));
app.use('/api/owners', require('./routes/owners'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/leases', require('./routes/leases'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/amc', require('./routes/amc'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/visitors', require('./routes/visitors'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/helpdesk', require('./routes/helpdesk'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/floor-assignments', require('./routes/floorAssignments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use((err, req, res, next) => {
    console.error('Error Details:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });
    
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Server Error'
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
