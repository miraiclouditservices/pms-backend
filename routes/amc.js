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
    .post(authorize('Super Admin', 'Staff Admin'), createAMC);

router
    .route('/:id')
    .get(getAMC)
    .put(authorize('Super Admin', 'Staff Admin'), updateAMC)
    .delete(authorize('Super Admin'), deleteAMC);

module.exports = router;
