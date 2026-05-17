// Generic controller for CRUD operations
exports.getAll = (Model) => async (req, res, next) => {
    try {
        let query;
        
        // Copy req.query
        const reqQuery = { ...req.query };

        // Fields to exclude from matching
        const removeFields = ['select', 'sort', 'page', 'limit'];
        removeFields.forEach(param => delete reqQuery[param]);

        // If Owner, apply strict data isolation filters
        if (req.user && req.user.role === 'Owner') {
            const Owner = require('../models/Owner');
            const owner = await Owner.findOne({ user: req.user._id }).populate('unitsAssigned');
            
            if (!owner) {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }

            const assignedUnits = owner.unitsAssigned || [];
            const assignedUnitNumbers = assignedUnits.map(u => u.unitNumber);

            const modelName = Model.modelName;

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

        query = Model.find(reqQuery);

        const data = await query;
        res.status(200).json({ success: true, count: data.length, data });
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
