const Visitor = require('../models/Visitor');
const factory = require('./factory');

exports.getVisitors = factory.getAll(Visitor);
exports.getVisitor = factory.getOne(Visitor);
exports.createVisitor = factory.createOne(Visitor);
exports.updateVisitor = factory.updateOne(Visitor);
exports.deleteVisitor = factory.deleteOne(Visitor);
