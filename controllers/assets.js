const Asset = require('../models/Asset');
const factory = require('./factory');

exports.getAssets = factory.getAll(Asset, { path: 'property unit', select: 'propertyName unitNumber unitType' });
exports.getAsset = factory.getOne(Asset, { path: 'property unit', select: 'propertyName unitNumber unitType' });
exports.createAsset = factory.createOne(Asset);
exports.updateAsset = factory.updateOne(Asset);
exports.deleteAsset = factory.deleteOne(Asset);
