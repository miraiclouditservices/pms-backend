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
    .post(authorize('SUPER_ADMIN'), createProperty);

router
    .route('/:id')
    .get(getProperty)
    .put(authorize('SUPER_ADMIN'), updateProperty)
    .delete(authorize('SUPER_ADMIN'), deleteProperty);

router.route('/:id/floors-units')
    .get(getPropertyStructure);

module.exports = router;
