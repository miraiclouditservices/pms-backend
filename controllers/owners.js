const Owner = require('../models/Owner');
const factory = require('./factory');
const User = require('../models/User');
const Material = require('../models/Material');
const Visitor = require('../models/Visitor');
const Lease = require('../models/Lease');

exports.getOwners = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        let query = {};
        if (search) {
            query.$or = [
                { ownerName: { $regex: search, $options: 'i' } },
                { emailId: { $regex: search, $options: 'i' } },
                { contactNumber: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } },
                { alternateNumber: { $regex: search, $options: 'i' } }
            ];
        }

        if (req.query.status) {
            query.status = req.query.status;
        }

        if (req.query.ownerType) {
            query.ownerType = req.query.ownerType;
        }

        const total = await Owner.countDocuments(query);
        const owners = await Owner.find(query)
            .populate('unitsAssigned')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            total,
            count: owners.length,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            data: owners
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
exports.getOwner = factory.getOne(Owner);

exports.getOwnerDetails = async (req, res, next) => {
    try {
        const owner = await Owner.findById(req.params.id).populate({
            path: 'unitsAssigned',
            populate: { path: 'property', select: 'propertyName building' }
        });
        
        if (!owner) {
            return res.status(404).json({ success: false, error: 'Owner not found' });
        }

        // Fetch related materials (Gate Passes)
        const materials = await Material.find({ 
            $or: [
                { officeName: owner.ownerName },
                { unit: { $in: owner.unitsAssigned.map(u => u.unitNumber) } }
            ]
        }).sort({ createdAt: -1 });

        // Fetch related visitors
        const visitors = await Visitor.find({
            $or: [
                { officeName: owner.ownerName },
                { unit: { $in: owner.unitsAssigned.map(u => u.unitNumber) } }
            ]
        }).sort({ createdAt: -1 });

        // Fetch related leases
        const leases = await Lease.find({ owner: owner._id })
            .populate({
                path: 'units',
                populate: { path: 'property', select: 'propertyName building' }
            })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: {
                owner,
                materials,
                visitors,
                leases
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createOwner = async (req, res, next) => {
    try {
        const { ownerName, emailId, password } = req.body;
        
        if (!emailId) {
            return res.status(400).json({ success: false, error: 'Email is required for account creation' });
        }

        // 1. Check if user already exists
        let user = await User.findOne({ email: emailId });
        
        if (!user) {
            // Create new User account
            user = await User.create({
                name: ownerName,
                email: emailId,
                password: password || 'Owner@123', // Default password
                role: 'Owner'
            });
        } else {
            // If user exists but is not an Owner, update role (or handle as error)
            if (user.role !== 'Owner' && user.role !== 'Admin') {
                user.role = 'Owner';
                await user.save();
            }
        }

        // 2. Check if Owner profile already exists for this email
        const existingOwner = await Owner.findOne({ emailId });
        if (existingOwner) {
            return res.status(400).json({ success: false, error: 'Owner profile already exists with this email' });
        }

        // 3. Create Owner profile linked to user
        req.body.user = user._id;
        const owner = await Owner.create(req.body);

        res.status(201).json({
            success: true,
            data: owner
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updateOwner = async (req, res, next) => {
    try {
        let owner = await Owner.findById(req.params.id);

        if (!owner) {
            return res.status(404).json({ success: false, error: 'Owner not found' });
        }

        // 1. Update linked User account if name, email, or password changed
        if (owner.user) {
            const user = await User.findById(owner.user);
            if (user) {
                if (req.body.ownerName) user.name = req.body.ownerName;
                if (req.body.emailId) user.email = req.body.emailId;
                if (req.body.password && req.body.password.trim() !== '') {
                    user.password = req.body.password;
                }
                await user.save();
            }
        }

        // 2. Update Owner profile
        owner = await Owner.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: owner
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteOwner = async (req, res, next) => {
    try {
        const owner = await Owner.findById(req.params.id);

        if (!owner) {
            return res.status(404).json({ success: false, error: 'Owner not found' });
        }

        // 1. Delete linked User account if it exists
        if (owner.user) {
            await User.findByIdAndDelete(owner.user);
        }

        // 2. Delete Owner profile
        await owner.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.getMyProfile = async (req, res, next) => {
    try {
        const owner = await Owner.findOne({ user: req.user._id });
        if (!owner) {
            return res.status(404).json({ success: false, error: 'Owner profile not found' });
        }

        // Dual-lookup lookup: retrieve units both by owner field on Unit and unitsAssigned array on Owner
        const Unit = require('../models/Unit');
        const unitsByOwner = await Unit.find({ owner: owner._id }).populate('property');
        const populatedOwner = await Owner.findById(owner._id).populate({
            path: 'unitsAssigned',
            populate: { path: 'property' }
        });
        const unitsFromProfile = populatedOwner ? (populatedOwner.unitsAssigned || []) : [];

        // Combine and de-duplicate units
        const combinedUnits = [...unitsByOwner, ...unitsFromProfile];
        const uniqueMap = new Map();
        combinedUnits.forEach(u => {
            if (u && u._id) uniqueMap.set(u._id.toString(), u);
        });
        const assignedUnits = Array.from(uniqueMap.values());

        // Return owner profile with fully resolved units!
        const responseData = owner.toObject();
        responseData.unitsAssigned = assignedUnits;

        res.status(200).json({
            success: true,
            data: responseData
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
