const Asset = require('../models/Asset');
const factory = require('./factory');

exports.getAssets = factory.getAll(Asset, { path: 'property unit createdBy', select: 'propertyName unitNumber unitType name role email phoneNumber' });
exports.getAsset = factory.getOne(Asset, { path: 'property unit createdBy', select: 'propertyName unitNumber unitType name role email phoneNumber' });
exports.createAsset = async (req, res, next) => {
    if (req.user) req.body.createdBy = req.user.id;
    return factory.createOne(Asset)(req, res, next);
};
exports.updateAsset = factory.updateOne(Asset);
exports.deleteAsset = factory.deleteOne(Asset);
