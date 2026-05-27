const mongoose = require('mongoose');

mongoose.connect('mongodb://mirai:voKNJLqc3GlLGlTk@ac-271kzgd-shard-00-00.rhq9af9.mongodb.net:27017,ac-271kzgd-shard-00-01.rhq9af9.mongodb.net:27017,ac-271kzgd-shard-00-02.rhq9af9.mongodb.net:27017/PMS-DB?ssl=true&replicaSet=atlas-522rx2-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0')
  .then(async () => {
    const Property = mongoose.model('Property', new mongoose.Schema({}, { strict: false }), 'properties');
    const Floor = mongoose.model('Floor', new mongoose.Schema({
      property: { type: mongoose.Schema.ObjectId, ref: 'Property' },
      floorNumber: String,
      floorName: String,
      totalSft: Number,
      status: String
    }), 'floors');
    const Unit = mongoose.model('Unit', new mongoose.Schema({}, { strict: false }), 'units');

    const properties = await Property.find({});
    console.log(`Found ${properties.length} properties to check...`);

    for (const prop of properties) {
      if (!prop.totalFloors) continue;

      // Check existing floors for this property
      const existingFloors = await Floor.find({ property: prop._id });
      const existingFloorNumbers = existingFloors.map(f => f.floorNumber);

      let createdCount = 0;

      // Generate missing floors up to totalFloors
      for (let i = 1; i <= prop.totalFloors; i++) {
        const floorStr = String(i);
        if (!existingFloorNumbers.includes(floorStr)) {
          const f = await Floor.create({
            property: prop._id,
            floorNumber: floorStr,
            floorName: `Floor ${i}`,
            totalSft: prop.totalSft ? Math.floor(prop.totalSft / prop.totalFloors) : 0,
            status: 'Active'
          });

          // Also update any orphan units if they exist
          await Unit.updateMany(
            { property: prop._id, floorNumber: i },
            { $set: { floor: f._id } }
          );
          createdCount++;
        }
      }

      if (createdCount > 0) {
        console.log(`Created ${createdCount} missing floors for property: ${prop.propertyName || prop._id}`);
      }
    }

    console.log('Done migrating floors.');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
