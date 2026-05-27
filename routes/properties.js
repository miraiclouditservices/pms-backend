const express = require('express');
const {
    getProperties,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty,
    getPropertyStructure
} = require('../controllers/properties');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getProperties)
    .post(authorize('Super Admin'), createProperty);

router
    .route('/:id')
    .get(getProperty)
    .put(authorize('Super Admin'), updateProperty)
    .delete(authorize('Super Admin'), deleteProperty);

router.route('/:id/floors-units')
    .get(getPropertyStructure);

module.exports = router;
