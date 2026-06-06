const express = require('express');
const {
    getOwners,
    getOwner,
    createOwner,
    updateOwner,
    deleteOwner,
    getOwnerDetails,
    getMyProfile
} = require('../controllers/owners');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/my-profile', getMyProfile);
router.get('/:id/details', getOwnerDetails);

router
    .route('/')
    .get(getOwners)
    .post(authorize('SUPER_ADMIN'), createOwner);

router
    .route('/:id')
    .get(getOwner)
    .put(authorize('SUPER_ADMIN'), updateOwner)
    .delete(authorize('SUPER_ADMIN'), deleteOwner);

module.exports = router;
