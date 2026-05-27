const User = require('../models/User');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
    try {
        let query = {};
        if (req.user) {
            if (req.user.role === 'Office Owner' || req.user.role === 'Owner') {
                query._id = req.user._id;
            } else if (req.user.role === 'Floor Admin') {
                const Floor = require('../models/Floor');
                const Unit = require('../models/Unit');
                const floors = await Floor.find({ assignedAdmin: req.user._id });
                const fIds = floors.map(f => f._id);
                const propertyIds = floors.map(f => f.property).filter(Boolean);
                const units = await Unit.find({ floor: { $in: fIds } }).select('_id');
                const unitIds = units.map(u => u._id);
                
                query = {
                    $or: [
                        { _id: req.user._id },
                        { assignedFloors: { $in: fIds } },
                        { assignedUnits: { $in: unitIds } },
                        { assignedProperties: { $in: propertyIds } }
                    ]
                };
            }
        }
        const users = await User.find(query);
        res.status(200).json({
            success: true,
            data: users
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create user
// @route   POST /api/users
// @access  Private/Admin
exports.createUser = async (req, res, next) => {
    try {
        // PRE-VALIDATION: Check if any assigned floor is already taken (only for Floor Admins)
        if (req.body.role === 'Floor Admin' && req.body.assignedFloors && req.body.assignedFloors.length > 0) {
            const Floor = require('../models/Floor');
            const takenFloors = await Floor.find({
                _id: { $in: req.body.assignedFloors },
                assignedAdmin: { $exists: true, $ne: null }
            });

            if (takenFloors.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Validation Error: One or more selected floors are already assigned to another Floor Admin.` 
                });
            }
        }

        // PRE-VALIDATION: Prevent Floor Admins from assigning properties/floors/units outside their management
        if (req.user && req.user.role === 'Floor Admin') {
            const Floor = require('../models/Floor');
            const Unit = require('../models/Unit');
            const floors = await Floor.find({ assignedAdmin: req.user._id });
            const fIds = floors.map(f => f._id.toString());
            const propertyIds = floors.map(f => f.property?.toString()).filter(Boolean);
            
            if (req.body.assignedFloors && req.body.assignedFloors.length > 0) {
                const invalidFloors = req.body.assignedFloors.filter(fid => !fIds.includes(fid.toString()));
                if (invalidFloors.length > 0) {
                    return res.status(400).json({ success: false, error: 'Validation Error: Cannot assign floors outside your managed floor assignments.' });
                }
            } else if (req.body.assignedUnits && req.body.assignedUnits.length > 0) {
                const units = await Unit.find({ _id: { $in: req.body.assignedUnits } }).select('floor');
                const invalidUnits = units.filter(u => !u.floor || !fIds.includes(u.floor.toString()));
                if (invalidUnits.length > 0) {
                    return res.status(400).json({ success: false, error: 'Validation Error: Cannot assign units outside your managed floors.' });
                }
            }

            if (req.body.assignedProperties && req.body.assignedProperties.length > 0) {
                const invalidProps = req.body.assignedProperties.filter(pid => !propertyIds.includes(pid.toString()));
                if (invalidProps.length > 0) {
                    return res.status(400).json({ success: false, error: 'Validation Error: Cannot assign properties outside your managed floors.' });
                }
            }
        }

        const user = await User.create(req.body);
        
        // Handle Role-based Profile Creation and Floor Assignments
        if (user.role === 'Office Owner' || user.role === 'Owner') {
            const Owner = require('../models/Owner');
            const newOwner = await Owner.create({
                ownerName: user.name,
                contactNumber: req.body.phoneNumber || 'N/A',
                emailId: user.email,
                ownerType: 'Individual',
                user: user._id
            });

            // Note: We do NOT assign Floor.assignedOwner for Office Owners since multiple Office Owners can occupy a Floor.
            // Floor.assignedOwner is reserved for whole-floor ownership.

            // Assign units to this newly created owner
            if (req.body.assignedUnits && req.body.assignedUnits.length > 0) {
                const Unit = require('../models/Unit');
                for (const unitId of req.body.assignedUnits) {
                    await Unit.findByIdAndUpdate(unitId, {
                        owner: newOwner._id,
                        ownerName: newOwner.ownerName,
                        tenant: null, // Clear any previous tenant mapping just in case
                    });
                }
            }
        } else if (user.role === 'Floor Admin') {
            if (req.body.assignedFloors && req.body.assignedFloors.length > 0) {
                const Floor = require('../models/Floor');
                for (const floorId of req.body.assignedFloors) {
                    await Floor.findByIdAndUpdate(floorId, {
                        assignedAdmin: user._id
                    });
                }
            }
        }

        res.status(201).json({
            success: true,
            data: user
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res, next) => {
    try {
        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const oldAssignedFloors = user.assignedFloors || [];
        const oldAssignedUnits = user.assignedUnits || [];

        // If password is provided, it will be hashed by pre-save hook
        user = await User.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Sync floor and unit assignments for Floor Admin
        if (user.role === 'Floor Admin') {
            const Floor = require('../models/Floor');
            
            // Clear old floors
            if (oldAssignedFloors.length > 0) {
                await Floor.updateMany(
                    { _id: { $in: oldAssignedFloors }, assignedAdmin: user._id },
                    { assignedAdmin: null }
                );
            }

            // Assign new floors
            if (user.assignedFloors && user.assignedFloors.length > 0) {
                await Floor.updateMany(
                    { _id: { $in: user.assignedFloors } },
                    { assignedAdmin: user._id }
                );
            }
        }

        // Sync for Office Owner
        if (user.role === 'Office Owner' || user.role === 'Owner') {
            const Owner = require('../models/Owner');
            let ownerProfile = await Owner.findOne({ user: user._id });
            if (!ownerProfile) {
                ownerProfile = await Owner.create({
                    ownerName: user.name,
                    contactNumber: user.phoneNumber || 'N/A',
                    emailId: user.email,
                    ownerType: 'Individual',
                    user: user._id
                });
            } else {
                ownerProfile.ownerName = user.name;
                ownerProfile.contactNumber = user.phoneNumber || 'N/A';
                ownerProfile.emailId = user.email;
                await ownerProfile.save();
            }

            // Note: We do NOT assign Floor.assignedOwner for Office Owners since multiple Office Owners can occupy a Floor.

            const Unit = require('../models/Unit');
            // Clear old units
            if (oldAssignedUnits.length > 0) {
                await Unit.updateMany(
                    { _id: { $in: oldAssignedUnits }, owner: ownerProfile._id },
                    { owner: null, ownerName: '' }
                );
            }

            // Assign new units
            if (user.assignedUnits && user.assignedUnits.length > 0) {
                await Unit.updateMany(
                    { _id: { $in: user.assignedUnits } },
                    { owner: ownerProfile._id, ownerName: ownerProfile.ownerName }
                );
            }
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Clean up assignments
        const Floor = require('../models/Floor');
        await Floor.updateMany({ assignedAdmin: user._id }, { assignedAdmin: null });

        const Owner = require('../models/Owner');
        const ownerProfile = await Owner.findOne({ user: user._id });
        if (ownerProfile) {
            await Floor.updateMany({ assignedOwner: ownerProfile._id }, { assignedOwner: null });
            
            const Unit = require('../models/Unit');
            await Unit.updateMany({ owner: ownerProfile._id }, { owner: null, ownerName: '' });

            await ownerProfile.deleteOne();
        }

        await user.deleteOne();
        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
