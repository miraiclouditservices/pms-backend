const Unit = require('../models/Unit');
const Owner = require('../models/Owner');
const factory = require('./factory');
const mongoose = require('mongoose');

// Get all units (with population & isolation check)
exports.getUnits = async (req, res, next) => {
    try {
        let reqQuery = { ...req.query };
        const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
        removeFields.forEach(param => delete reqQuery[param]);

        // Clean up "all" values from filters
        if (reqQuery.property === 'all') delete reqQuery.property;
        if (reqQuery.floor === 'all') delete reqQuery.floor;
        if (reqQuery.unitStatus === 'all') delete reqQuery.unitStatus;

        // Strict data isolation filter for Floor Assignments
        if (req.user) {
            if (req.user.role === 'Office Owner' || req.user.role === 'Owner') {
                const owner = await mongoose.model('Owner').findOne({ user: req.user._id });
                if (!owner) return res.status(200).json({ success: true, count: 0, data: [], pagination: {} });
                
                // Find floors assigned to this owner
                const assignedFloors = await mongoose.model('Floor').find({ assignedOwner: owner._id });
                const floorIds = assignedFloors.map(f => f._id);
                reqQuery.floor = { $in: floorIds };
            } else if (req.user.role === 'Floor Admin') {
                // Find floors assigned to this admin
                const assignedFloors = await mongoose.model('Floor').find({ assignedAdmin: req.user._id });
                const floorIds = assignedFloors.map(f => f._id);
                reqQuery.floor = { $in: floorIds };
            }
        }

        // Search Query parameter support
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            reqQuery.$or = [
                { unitNumber: searchRegex },
                { unitName: searchRegex },
                { unitType: searchRegex }
            ];
        }

        // Pagination parameters
        let units;
        let total;
        let totalPages = 1;
        const pagination = {};

        if (req.query.page || req.query.limit) {
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 10;
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;
            
            total = await Unit.countDocuments(reqQuery);
            totalPages = Math.ceil(total / limit) || 1;

            units = await Unit.find(reqQuery)
                .populate('property', 'propertyName building')
                .populate('floor', 'floorNumber floorName')
                .populate('tenant', 'tenantName contactNumber emailId')
                .populate('lease', 'tenantName tenantContact status')
                .populate('owner', 'ownerName contactNumber emailId')
                .skip(startIndex)
                .limit(limit);

            // Self-heal unitStatus for assigned owners/tenants based on agreementStatus
            const User = require('../models/User');
            const MeetingRoom = require('../models/MeetingRoom');
            const cleanUnitsList = [];
            for (const unit of units) {
                // Self-heal lease if not set but unit is associated with active lease
                if (!unit.lease) {
                    const Lease = require('../models/Lease');
                    const activeLease = await Lease.findOne({ units: unit._id, status: { $in: ['Active', 'Renewal Pending'] } });
                    if (activeLease) {
                        unit.lease = activeLease._id;
                        unit.unitStatus = 'Occupied';
                        await unit.save({ validateBeforeSave: false });
                        await unit.populate('lease', 'tenantName tenantContact status');
                    }
                }
                const isMeetingRoom = await MeetingRoom.findOne({ unit: unit._id });
                if (isMeetingRoom) {
                    // Unit is a meeting room — ensure Reserved
                    if (unit.unitStatus !== 'Reserved') {
                        unit.unitStatus = 'Reserved';
                        await unit.save({ validateBeforeSave: false });
                    }
                } else if (unit.tenant) {
                    // Tenant assigned — always Occupied
                    if (unit.unitStatus !== 'Occupied') {
                        unit.unitStatus = 'Occupied';
                        await unit.save({ validateBeforeSave: false });
                    }
                } else if (unit.owner) {
                    // Owner ref exists — validate agreement status
                    const ownerId = (unit.owner && unit.owner._id) ? unit.owner._id : unit.owner;
                    const ownerObj = await Owner.findById(ownerId);
                    if (ownerObj && ownerObj.user) {
                        const ownerUser = await User.findById(ownerObj.user);
                        if (ownerUser) {
                            if (ownerUser.agreementStatus === 'Active' || ownerUser.agreementStatus === 'Pending') {
                                if (unit.unitStatus !== 'Occupied') {
                                    unit.unitStatus = 'Occupied';
                                    await unit.save({ validateBeforeSave: false });
                                }
                            } else {
                                // Agreement deactivated — release the unit
                                unit.unitStatus = 'Available';
                                unit.owner = null;
                                unit.ownerName = '';
                                await unit.save({ validateBeforeSave: false });
                            }
                        }
                        // If ownerUser not found, keep status unchanged
                    }
                } else {
                    // No owner ref — attempt recovery from User.assignedUnits
                    const assignedUser = await User.findOne({
                        assignedUnits: unit._id,
                        agreementStatus: { $in: ['Active', 'Pending'] },
                        role: { $in: ['Office Owner', 'Owner'] }
                    });
                    if (assignedUser) {
                        let recoveredOwner = await Owner.findOne({ user: assignedUser._id });
                        if (!recoveredOwner) {
                            recoveredOwner = await Owner.create({
                                ownerName: assignedUser.name,
                                contactNumber: assignedUser.phoneNumber || 'N/A',
                                emailId: assignedUser.email,
                                ownerType: 'Individual',
                                user: assignedUser._id
                            });
                        }
                        if (recoveredOwner) {
                            unit.owner = recoveredOwner._id;
                            unit.ownerName = recoveredOwner.ownerName;
                            unit.unitStatus = 'Occupied';
                            await unit.save({ validateBeforeSave: false });
                            // Re-populate owner for response
                            await unit.populate('owner', 'ownerName contactNumber emailId');
                        }
                    }
                }

                const unitObj = unit.toObject ? unit.toObject() : JSON.parse(JSON.stringify(unit));
                // Preserve ownerName string even if owner ref was just set
                if (!unitObj.ownerName && unit.ownerName) {
                    unitObj.ownerName = unit.ownerName;
                }
                if (isMeetingRoom) {
                    unitObj.isMeetingRoom = true;
                }
                cleanUnitsList.push(unitObj);
            }
            units = cleanUnitsList;

            if (endIndex < total) {
                pagination.next = { page: page + 1, limit };
            }
            if (startIndex > 0) {
                pagination.prev = { page: page - 1, limit };
            }
        } else {
            // Non-paginated (e.g. for dropdowns)
            units = await Unit.find(reqQuery)
                .populate('property', 'propertyName building')
                .populate('floor', 'floorNumber floorName')
                .populate('tenant', 'tenantName contactNumber emailId')
                .populate('lease', 'tenantName tenantContact status')
                .populate('owner', 'ownerName contactNumber emailId');
            
            // Self-heal unitStatus for assigned owners/tenants based on agreementStatus
            const User = require('../models/User');
            const MeetingRoom = require('../models/MeetingRoom');
            const cleanUnitsList = [];
            for (const unit of units) {
                // Self-heal lease if not set but unit is associated with active lease
                if (!unit.lease) {
                    const Lease = require('../models/Lease');
                    const activeLease = await Lease.findOne({ units: unit._id, status: { $in: ['Active', 'Renewal Pending'] } });
                    if (activeLease) {
                        unit.lease = activeLease._id;
                        unit.unitStatus = 'Occupied';
                        await unit.save({ validateBeforeSave: false });
                        await unit.populate('lease', 'tenantName tenantContact status');
                    }
                }
                const isMeetingRoom = await MeetingRoom.findOne({ unit: unit._id });
                if (isMeetingRoom) {
                    if (unit.unitStatus !== 'Reserved') {
                        unit.unitStatus = 'Reserved';
                        await unit.save({ validateBeforeSave: false });
                    }
                } else if (unit.tenant) {
                    if (unit.unitStatus !== 'Occupied') {
                        unit.unitStatus = 'Occupied';
                        await unit.save({ validateBeforeSave: false });
                    }
                } else if (unit.owner) {
                    const ownerId = (unit.owner && unit.owner._id) ? unit.owner._id : unit.owner;
                    const ownerObj = await Owner.findById(ownerId);
                    if (ownerObj && ownerObj.user) {
                        const ownerUser = await User.findById(ownerObj.user);
                        if (ownerUser) {
                            if (ownerUser.agreementStatus === 'Active' || ownerUser.agreementStatus === 'Pending') {
                                if (unit.unitStatus !== 'Occupied') {
                                    unit.unitStatus = 'Occupied';
                                    await unit.save({ validateBeforeSave: false });
                                }
                            } else {
                                unit.unitStatus = 'Available';
                                unit.owner = null;
                                unit.ownerName = '';
                                await unit.save({ validateBeforeSave: false });
                            }
                        }
                        // If ownerUser not found, keep current status unchanged
                    }
                } else {
                    // No owner ref — attempt recovery from User.assignedUnits
                    const assignedUser = await User.findOne({
                        assignedUnits: unit._id,
                        agreementStatus: { $in: ['Active', 'Pending'] },
                        role: { $in: ['Office Owner', 'Owner'] }
                    });
                    if (assignedUser) {
                        let recoveredOwner = await Owner.findOne({ user: assignedUser._id });
                        if (!recoveredOwner) {
                            recoveredOwner = await Owner.create({
                                ownerName: assignedUser.name,
                                contactNumber: assignedUser.phoneNumber || 'N/A',
                                emailId: assignedUser.email,
                                ownerType: 'Individual',
                                user: assignedUser._id
                            });
                        }
                        if (recoveredOwner) {
                            unit.owner = recoveredOwner._id;
                            unit.ownerName = recoveredOwner.ownerName;
                            unit.unitStatus = 'Occupied';
                            await unit.save({ validateBeforeSave: false });
                            await unit.populate('owner', 'ownerName contactNumber emailId');
                        }
                    }
                }

                const unitObj = unit.toObject ? unit.toObject() : JSON.parse(JSON.stringify(unit));
                if (!unitObj.ownerName && unit.ownerName) {
                    unitObj.ownerName = unit.ownerName;
                }
                if (isMeetingRoom) {
                    unitObj.isMeetingRoom = true;
                }
                cleanUnitsList.push(unitObj);
            }
            units = cleanUnitsList;
            total = units.length;
        }

        res.status(200).json({
            success: true,
            count: units.length,
            total,
            totalPages,
            pagination,
            data: units
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Get single unit with population
exports.getUnit = async (req, res, next) => {
    try {
        const unit = await Unit.findById(req.params.id)
            .populate('property', 'propertyName building')
            .populate('floor', 'floorNumber floorName')
            .populate('tenant', 'tenantName')
            .populate('lease', 'tenantName tenantContact status')
            .populate('owner', 'ownerName contactNumber');

        if (!unit) {
            return res.status(404).json({ success: false, error: 'Unit not found' });
        }

        // Self-heal lease if not set but unit is associated with active lease
        if (!unit.lease) {
            const Lease = require('../models/Lease');
            const activeLease = await Lease.findOne({ units: unit._id, status: { $in: ['Active', 'Renewal Pending'] } });
            if (activeLease) {
                unit.lease = activeLease._id;
                unit.unitStatus = 'Occupied';
                await unit.save({ validateBeforeSave: false });
                await unit.populate('lease', 'tenantName tenantContact status');
            }
        }

        if (unit.tenant) {
            if (unit.unitStatus !== 'Occupied') {
                unit.unitStatus = 'Occupied';
                await unit.save({ validateBeforeSave: false });
            }
        } else if (unit.owner) {
            const User = require('../models/User');
            const ownerObj = await Owner.findById(unit.owner._id);
            if (ownerObj && ownerObj.user) {
                const ownerUser = await User.findById(ownerObj.user);
                if (ownerUser) {
                    if (ownerUser.agreementStatus === 'Active' || ownerUser.agreementStatus === 'Pending') {
                        if (unit.unitStatus !== 'Occupied') {
                            unit.unitStatus = 'Occupied';
                            await unit.save({ validateBeforeSave: false });
                        }
                    } else {
                        unit.unitStatus = 'Available';
                        unit.owner = null;
                        unit.ownerName = '';
                        await unit.save({ validateBeforeSave: false });
                    }
                }
            }
        }

        res.status(200).json({
            success: true,
            data: unit
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create unit
exports.createUnit = async (req, res, next) => {
    try {
        if (req.body.floor && req.body.sqft) {
            const floor = await mongoose.model('Floor').findById(req.body.floor);
            if (floor) {
                const effectiveAvailable = Math.max((floor.totalSft || 0) - (floor.occupiedSft || 0), 0);
                if (req.body.sqft > effectiveAvailable) {
                    return res.status(400).json({
                        success: false,
                        error: `Cannot create unit: ${req.body.sqft} SFT exceeds floor's available SFT of ${effectiveAvailable}`
                    });
                }
            }
        }
        const unit = await Unit.create(req.body);
        res.status(201).json({ success: true, data: unit });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, error: 'Duplicate unit number on this property.' });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update unit
exports.updateUnit = async (req, res, next) => {
    try {
        let unit = await Unit.findById(req.params.id);
        if (!unit) return res.status(404).json({ success: false, error: 'Unit not found' });

        // Enforce lock: if unit is assigned as a Meeting Room, its status cannot be modified directly
        const MeetingRoom = require('../models/MeetingRoom');
        const isMeetingRoom = await MeetingRoom.findOne({ unit: req.params.id });
        if (isMeetingRoom) {
            if (req.body.unitStatus && req.body.unitStatus !== 'Reserved') {
                return res.status(400).json({
                    success: false,
                    error: 'This unit is designated as a shared Meeting Room. You cannot modify its status directly.'
                });
            }
        }

        // Enforce lock: if owner agreementStatus is Active, status cannot change
        if (unit.owner) {
            const User = require('../models/User');
            const ownerObj = await Owner.findById(unit.owner);
            if (ownerObj && ownerObj.user) {
                const ownerUser = await User.findById(ownerObj.user);
                if (ownerUser && ownerUser.agreementStatus === 'Active') {
                    if (req.body.unitStatus && req.body.unitStatus !== 'Occupied') {
                        return res.status(400).json({
                            success: false,
                            error: 'This unit has an Active agreement. You cannot change its status.'
                        });
                    }
                }
            }
        }

        if (req.body.floor && req.body.sqft) {
            const floor = await mongoose.model('Floor').findById(req.body.floor);
            // SFT validation (adjust availableSft by old unit sqft)
            if (floor) {
                const effectiveAvailable = Math.max((floor.totalSft || 0) - (floor.occupiedSft || 0), 0) + (unit.sqft || 0);
                if (req.body.sqft > effectiveAvailable) {
                    return res.status(400).json({
                        success: false,
                        error: `Cannot update unit: ${req.body.sqft} SFT exceeds floor's effective available SFT of ${effectiveAvailable}`
                    });
                }
            }
        }

        unit = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.status(200).json({ success: true, data: unit });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, error: 'Duplicate unit number on this property.' });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteUnit = async (req, res, next) => {
    try {
        const MeetingRoom = require('../models/MeetingRoom');
        const isMeetingRoom = await MeetingRoom.findOne({ unit: req.params.id });
        if (isMeetingRoom) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete unit: it is currently designated as a shared Meeting Room.'
            });
        }
        
        const unit = await Unit.findById(req.params.id);
        if (!unit) {
            return res.status(404).json({ success: false, error: 'Unit not found' });
        }
        await unit.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
