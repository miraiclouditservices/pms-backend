const express = require('express');
const {
    getAMCs,
    getAMC,
    createAMC,
    updateAMC,
    deleteAMC
} = require('../controllers/amc');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getAMCs)
    .post(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), createAMC);

router
    .route('/:id')
    .get(getAMC)
    .put(authorize('SUPER_ADMIN', 'STAFF_ADMIN'), updateAMC)
    .delete(authorize('SUPER_ADMIN'), deleteAMC);

module.exports = router;
