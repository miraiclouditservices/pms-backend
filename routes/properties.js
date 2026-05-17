const express = require('express');
const {
    getProperties,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty
} = require('../controllers/properties');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getProperties)
    .post(authorize('Admin'), createProperty);

router
    .route('/:id')
    .get(getProperty)
    .put(authorize('Admin'), updateProperty)
    .delete(authorize('Admin'), deleteProperty);

module.exports = router;
