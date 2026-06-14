const express = require('express');
const {
    getAgreementByUser,
    recordAgreementPayment
} = require('../controllers/agreements');

const router = express.Router();
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/user/:userId', getAgreementByUser);
router.post('/:agreementId/payments', recordAgreementPayment);

module.exports = router;
