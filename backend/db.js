const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not defined in .env file");
    process.exit(1);
}

const connectDB = async () => {
    try {
        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("✅ MongoDB Connected (Atlas)");
    } catch (err) {
        console.error("❌ MongoDB Connection Failed");
        if (err.message.includes("authentication failed")) {
            console.error("👉 ERROR: Aapka Password galat hai ya usme special characters (@, #, etc.) hain.");
            console.error("👉 SOLUTION: Agar password me @ hai toh use %40 likhein.");
        } else if (err.message.includes("ETIMEOUT") || err.message.includes("ENOTFOUND")) {
            console.error("👉 ERROR: Network issue ya IP Whitelist problem.");
            console.error("👉 SOLUTION: Atlas Dashboard -> Network Access -> Add IP Address -> 'Allow Access from Anywhere' karein.");
        }
        console.error("Full Error Details:", err.message);
        process.exit(1);
    }
};

connectDB();

module.exports = mongoose.connection;