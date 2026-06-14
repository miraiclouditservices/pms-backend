// Generic controller for CRUD operations
exports.getAll = (Model, populateOptions) => async (req, res, next) => {
    try {
        let query;
        
        // Copy req.query
        const reqQuery = { ...req.query };

        // Fields to exclude from matching
        const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
        removeFields.forEach(param => delete reqQuery[param]);

        // Hoist modelName so it's accessible in both Owner isolation and search blocks
        const modelName = Model.modelName;

        // If Owner, apply strict data isolation filters
        if (req.user && req.user.role === 'Owner') {
            const Owner = require('../models/Owner');
            const owner = await Owner.findOne({ user: req.user._id }).populate('unitsAssigned');
            
            if (!owner) {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }

            const assignedUnits = owner.unitsAssigned || [];
            const assignedUnitNumbers = assignedUnits.map(u => u.unitNumber);

            if (modelName === 'Visitor' || modelName === 'Helpdesk') {
                reqQuery.$or = [
                    { officeName: owner.ownerName },
                    { unit: { $in: assignedUnitNumbers } }
                ];
            } else if (modelName === 'Booking') {
                reqQuery.bookedBy = owner.ownerName;
            } else if (modelName === 'Material') {
                reqQuery.$or = [
                    { companyName: owner.ownerName },
                    { unitNumber: { $in: assignedUnitNumbers } }
                ];
            } else if (modelName === 'Unit') {
                reqQuery.unitNumber = { $in: assignedUnitNumbers };
            } else if (modelName === 'Lease') {
                reqQuery.owner = owner._id;
            }
        }

        if (req.query.search && typeof req.query.search === 'string') {
            const regex = new RegExp(req.query.search, 'i');
            // Basic generic search for text fields (can be customized per model)
            // If it's Asset, search specific fields. Otherwise fallback to empty or known fields.
            if (modelName === 'Asset') {
                reqQuery.$or = [
                    { assetDescription: regex },
                    { assetCode: regex },
                    { serialNumber: regex },
                    { category: regex }
                ];
            } else if (modelName === 'Vendor') {
                reqQuery.$or = [
                    { vendorName: regex },
                    { vendorCode: regex },
                    { contactName: regex },
                    { contactNumber: regex },
                    { emailId: regex }
                ];
            }
        }

        query = Model.find(reqQuery);

        if (populateOptions) {
            query = query.populate(populateOptions);
        }

        // Sorting — ?sort=field or ?sort=-field (desc). Default: newest first.
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            query = query.sort(sortBy);
        } else {
            query = query.sort('-createdAt');
        }

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 1000;
        const startIndex = (page - 1) * limit;

        if (req.query.page || req.query.limit) {
            query = query.skip(startIndex).limit(limit);
        }

        const data = await query;
        const total = await Model.countDocuments(reqQuery);

        res.status(200).json({ 
            success: true, 
            count: data.length, 
            total: total,
            page: page,
            pages: Math.ceil(total / limit),
            data 
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.getOne = (Model) => async (req, res, next) => {
    try {
        const data = await Model.findById(req.params.id);
        if (!data) return res.status(404).json({ success: false, error: 'Resource not found' });
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.createOne = (Model) => async (req, res, next) => {
    try {
        const data = await Model.create(req.body);
        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updateOne = (Model) => async (req, res, next) => {
    try {
        const data = await Model.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!data) return res.status(404).json({ success: false, error: 'Resource not found' });
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteOne = (Model) => async (req, res, next) => {
    try {
        const data = await Model.findById(req.params.id);
        if (!data) return res.status(404).json({ success: false, error: 'Resource not found' });
        await data.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
