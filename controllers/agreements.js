const User = require('../models/User');
const Payment = require('../models/Payment');
const Lease = require('../models/Lease');

// @desc    Get agreement by user ID
// @route   GET /api/agreements/user/:userId
// @access  Private
exports.getAgreementByUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const start = user.floorAssignmentStartDate;
        const end = user.floorAssignmentEndDate;
        const paymentType = user.paymentType || 'Monthly';
        const dueDay = user.paymentDueDay || 5;

        // Calculate term in months
        let termMonths = 12;
        if (start && end) {
            const s = new Date(start);
            const e = new Date(end);
            if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
                termMonths = Math.max((e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1, 1);
            }
        }

        const totalAmount = user.totalAgreementAmount || ((user.monthlyManagementAmount || 0) * termMonths);

        // Calculate installment amount
        let intervalMonths = 1;
        if (paymentType.includes('Quarterly')) intervalMonths = 3;
        else if (paymentType.includes('Half-Yearly')) intervalMonths = 6;
        else if (paymentType.includes('Yearly')) intervalMonths = 12;
        else if (paymentType.includes('One Time')) intervalMonths = termMonths;

        const numInstallments = Math.max(1, Math.ceil(termMonths / intervalMonths));
        const installmentAmount = Math.ceil(totalAmount / numInstallments);

        // Fetch leases to get payment history if Tenant
        let leaseIds = [];
        if (user.role === 'Tenant') {
            const Tenant = require('../models/Tenant');
            const tenant = await Tenant.findOne({ user: user._id });
            if (tenant && tenant.lease) {
                leaseIds.push(tenant.lease);
            }
        }
        
        // Also look up leases by tenantEmail or tenantName
        const leases = await Lease.find({
            $or: [
                { tenantEmail: user.email },
                { tenantName: user.name }
            ]
        });
        leases.forEach(l => {
            if (!leaseIds.includes(l._id.toString())) {
                leaseIds.push(l._id);
            }
        });

        // Find payments associated with this user or lease
        const payments = await Payment.find({
            $or: [
                { user: user._id },
                { lease: { $in: leaseIds } }
            ]
        }).sort({ createdAt: -1 });

        const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const pendingAmount = Math.max(0, totalAmount - totalPaid);

        const formattedPayments = payments.map(p => ({
            _id: p._id,
            receiptNumber: p.transactionId || `REC-${p._id.toString().slice(-6).toUpperCase()}`,
            paymentDate: p.paymentDate,
            amountPaid: p.amount,
            amount: p.amount,
            paymentMode: p.paymentMethod || 'Online',
            transactionRef: p.transactionId,
            notes: p.remarks || '',
            status: p.status || 'Paid'
        }));

        res.status(200).json({
            success: true,
            data: {
                agreements: [
                    {
                        _id: user._id,
                        agreementNumber: `AGR-${user._id.toString().slice(-6).toUpperCase()}`,
                        startDate: start,
                        endDate: end,
                        totalAmount,
                        paymentType,
                        paymentDueDay: dueDay,
                        installmentAmount,
                        totalPaid,
                        pendingAmount,
                        payments: formattedPayments
                    }
                ],
                summary: {
                    totalAmount,
                    totalPaid,
                    totalPending: pendingAmount,
                    activeCount: user.agreementStatus === 'Active' ? 1 : 0
                }
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Record payment for agreement
// @route   POST /api/agreements/:agreementId/payments
// @access  Private
exports.recordAgreementPayment = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.agreementId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const pDate = new Date(req.body.paymentDate || Date.now());
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const month = monthNames[pDate.getMonth()];
        const year = pDate.getFullYear();

        // Check duplicate payment for this user/month/year
        const existingPayment = await Payment.findOne({
            user: user._id,
            month,
            year
        });

        if (existingPayment) {
            return res.status(400).json({
                success: false,
                error: `Payment for ${month} ${year} has already been recorded for this user.`
            });
        }

        // Check lease
        let leaseId = null;
        if (user.role === 'Tenant') {
            const Tenant = require('../models/Tenant');
            const tenant = await Tenant.findOne({ user: user._id });
            if (tenant && tenant.lease) {
                leaseId = tenant.lease;
            }
        }
        if (!leaseId) {
            const lease = await Lease.findOne({
                $or: [
                    { tenantEmail: user.email },
                    { tenantName: user.name }
                ]
            });
            if (lease) {
                leaseId = lease._id;
            }
        }

        const amountPaid = Number(req.body.amountPaid);
        if (isNaN(amountPaid) || amountPaid <= 0) {
            return res.status(400).json({ success: false, error: 'Please enter a valid payment amount.' });
        }

        const paymentData = {
            user: user._id,
            amount: amountPaid,
            paymentDate: pDate,
            paymentMethod: req.body.paymentMode || 'Online',
            transactionId: req.body.transactionRef || `TRX-${Date.now()}`,
            status: 'Paid',
            remarks: req.body.notes || 'Recorded via admin portal',
            month,
            year
        };

        if (leaseId) {
            paymentData.lease = leaseId;
        }

        const payment = await Payment.create(paymentData);

        // If leaseId was found and matching invoice exists in Finance, mark as Paid
        if (leaseId) {
            const Finance = require('../models/Finance');
            await Finance.findOneAndUpdate(
                { lease: leaseId, month, year },
                { status: 'Paid' }
            );
        }

        // Update user payment status if fully paid
        // First get all payments for user
        const allPayments = await Payment.find({
            $or: [
                { user: user._id },
                { lease: leaseId ? leaseId : null }
            ].filter(q => q.user || q.lease)
        });

        const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

        // Calculate term and totalAgreementAmount
        const start = user.floorAssignmentStartDate;
        const end = user.floorAssignmentEndDate;
        let termMonths = 12;
        if (start && end) {
            const s = new Date(start);
            const e = new Date(end);
            if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
                termMonths = Math.max((e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1, 1);
            }
        }
        const totalAmount = user.totalAgreementAmount || ((user.monthlyManagementAmount || 0) * termMonths);

        if (totalPaid >= totalAmount) {
            user.paymentStatus = 'Paid';
            await user.save();
        }

        res.status(201).json({
            success: true,
            data: payment
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
