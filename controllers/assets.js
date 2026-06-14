const Asset = require('../models/Asset');
const Property = require('../models/Property');
const User = require('../models/User');
const Notification = require('../models/Notification');
const factory = require('./factory');

// Helper to send system notifications
const sendAssetNotification = async (asset, title, message) => {
    try {
        // Find FLOOR_ADMINs & OFFICE_OWNERs of the property
        const query = {
            role: { $in: ['FLOOR_ADMIN', 'OFFICE_OWNER'] }
        };
        if (asset.property) {
            query.assignedProperties = asset.property;
        }

        const recipients = await User.find(query);
        
        // Also add the user who created it
        if (asset.createdBy) {
            const creator = await User.findById(asset.createdBy);
            if (creator) recipients.push(creator);
        }

        const uniqueIds = Array.from(new Set(recipients.map(r => r._id.toString())));

        if (uniqueIds.length > 0) {
            const notifications = uniqueIds.map(userId => ({
                user: userId,
                title,
                message,
                type: 'Info'
            }));
            await Notification.insertMany(notifications);
        }
    } catch (err) {
        console.error('Failed to send asset notification:', err);
    }
};

exports.getAssets = factory.getAll(Asset, { path: 'property unit createdBy', select: 'propertyName unitNumber unitType name role email phoneNumber' });
exports.getAsset = factory.getOne(Asset, { path: 'property unit createdBy', select: 'propertyName unitNumber unitType name role email phoneNumber' });

exports.createAsset = async (req, res, next) => {
    try {
        if (req.user) req.body.createdBy = req.user.id;
        
        // Sanitize empty string ObjectId references to null
        ['property', 'unit', 'vendor', 'createdBy'].forEach(field => {
            if (req.body[field] === '') {
                req.body[field] = null;
            }
        });

        const data = await Asset.create(req.body);

        // Fetch property details to compose the message
        let propertyName = '';
        if (data.property) {
            const prop = await Property.findById(data.property);
            propertyName = prop ? prop.propertyName : '';
        }

        // Send alert
        await sendAssetNotification(
            data,
            'New Asset Added',
            `Asset "${data.assetDescription}" (${data.category}) has been added to ${propertyName || 'property'} (Code: ${data.assetCode || 'N/A'}).`
        );

        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updateAsset = async (req, res, next) => {
    try {
        const originalAsset = await Asset.findById(req.params.id);
        if (!originalAsset) {
            return res.status(404).json({ success: false, error: 'Resource not found' });
        }

        // Sanitize empty string ObjectId references to null
        ['property', 'unit', 'vendor', 'createdBy'].forEach(field => {
            if (req.body[field] === '') {
                req.body[field] = null;
            }
        });

        const data = await Asset.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Send alert
        let propertyName = '';
        if (data.property) {
            const prop = await Property.findById(data.property);
            propertyName = prop ? prop.propertyName : '';
        }

        const statusChangeMessage = originalAsset.assetStatus !== data.assetStatus 
            ? ` Status updated from "${originalAsset.assetStatus}" to "${data.assetStatus}".`
            : '';

        await sendAssetNotification(
            data,
            'Asset Updated',
            `Asset "${data.assetDescription}" (Code: ${data.assetCode || 'N/A'}) in ${propertyName || 'property'} has been updated.${statusChangeMessage}`
        );

        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteAsset = async (req, res, next) => {
    try {
        const data = await Asset.findById(req.params.id);
        if (!data) {
            return res.status(404).json({ success: false, error: 'Resource not found' });
        }

        await data.deleteOne();

        // Send alert
        await sendAssetNotification(
            data,
            'Asset Removed',
            `Asset "${data.assetDescription}" (Code: ${data.assetCode || 'N/A'}) has been deleted/removed.`
        );

        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
