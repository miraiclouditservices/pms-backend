const mongoose = require('mongoose');

const uri = "mongodb://mirai:voKNJLqc3GlLGlTk@ac-271kzgd-shard-00-00.rhq9af9.mongodb.net:27017,ac-271kzgd-shard-00-01.rhq9af9.mongodb.net:27017,ac-271kzgd-shard-00-02.rhq9af9.mongodb.net:27017/PMS-DB?tls=true&tlsAllowInvalidCertificates=true&replicaSet=atlas-271kzgd-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0";

async function run() {
    try {
        console.log("Connecting...");
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log("SUCCESS!");
        process.exit(0);
    } catch (err) {
        console.log("FAILED:", err.message);
        process.exit(1);
    }
}
run();
