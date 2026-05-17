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
    .post(authorize('Admin'), createAMC);

router
    .route('/:id')
    .get(getAMC)
    .put(authorize('Admin'), updateAMC)
    .delete(authorize('Admin'), deleteAMC);

module.exports = router;
