const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not defined in .env file");
    process.exit(1);
}

const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB Connected (Atlas)");
    } catch (err) {
        console.error("❌ MongoDB Connection Failed");
        console.error(err.message);
        process.exit(1);
    }
};

connectDB();

module.exports = mongoose.connection;