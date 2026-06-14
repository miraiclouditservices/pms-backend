const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        console.log(`Connected to database: ${conn.connection.name}`);

        // List all collections and indexes
        try {
            const collections = await conn.connection.db.listCollections().toArray();
            console.log('Collections in DB:', collections.map(c => c.name));
            for (const col of collections) {
                const indexes = await conn.connection.db.collection(col.name).indexes();
                console.log(`Indexes for collection ${col.name}:`, indexes);

                // If this collection has ticketNumber_1, drop it
                const hasTicketNumberIndex = indexes.some(idx => idx.name === 'ticketNumber_1');
                if (hasTicketNumberIndex) {
                    await conn.connection.db.collection(col.name).dropIndex('ticketNumber_1');
                    console.log(`Successfully dropped old ticketNumber_1 index from ${col.name} collection`);
                }
            }
        } catch (err) {
            console.log('Error listing/dropping indexes:', err.message);
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
