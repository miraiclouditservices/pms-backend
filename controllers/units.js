const Unit = require('../models/Unit');
const factory = require('./factory');

exports.getUnits = factory.getAll(Unit);
exports.getUnit = factory.getOne(Unit);
exports.createUnit = factory.createOne(Unit);
exports.updateUnit = factory.updateOne(Unit);
exports.deleteUnit = factory.deleteOne(Unit);
