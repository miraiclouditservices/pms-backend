const Vendor = require('../models/Vendor');
const factory = require('./factory');

exports.getVendors = factory.getAll(Vendor);
exports.getVendor = factory.getOne(Vendor);
exports.createVendor = factory.createOne(Vendor);
exports.updateVendor = factory.updateOne(Vendor);
exports.deleteVendor = factory.deleteOne(Vendor);

exports.getVendorStats = async (req, res, next) => {
    try {
        const stats = await Vendor.aggregate([
            {
                $facet: {
                    totalVendors: [{ $count: "count" }],
                    activeVendors: [
                        { $match: { status: "Active" } },
                        { $count: "count" }
                    ],
                    inactiveVendors: [
                        { $match: { status: "Inactive" } },
                        { $count: "count" }
                    ],
                    totalContacts: [
                        { $match: { contactName: { $exists: true, $ne: "" } } },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const result = {
            total: stats[0].totalVendors[0]?.count || 0,
            active: stats[0].activeVendors[0]?.count || 0,
            inactive: stats[0].inactiveVendors[0]?.count || 0,
            contacts: stats[0].totalContacts[0]?.count || 0
        };

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};
