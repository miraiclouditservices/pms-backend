const Material = require('../models/Material');
const factory = require('./factory');

exports.getMaterials = factory.getAll(Material);
exports.getMaterial = factory.getOne(Material);
exports.createMaterial = factory.createOne(Material);
exports.updateMaterial = factory.updateOne(Material);
exports.deleteMaterial = factory.deleteOne(Material);
