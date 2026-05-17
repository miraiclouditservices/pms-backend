const AMC = require('../models/AMC');
const factory = require('./factory');

exports.getAMCs = factory.getAll(AMC);
exports.getAMC = factory.getOne(AMC);
exports.createAMC = factory.createOne(AMC);
exports.updateAMC = factory.updateOne(AMC);
exports.deleteAMC = factory.deleteOne(AMC);
