const mongoose = require("mongoose");
require("dotenv").config();

// Temporary Hardcoded URI to bypass Render Env issues
const MONGODB_URI = "mongodb+srv://sachinku1259_db_user:Va9AEm8sLgW0mgG0@cluster0.kgokl91.mongodb.net/solo_casino?retryWrites=true&w=majority";

const connectDB = async () => {
    try {
        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB Connected (Atlas)");
    } catch (err) {
        console.error("❌ MongoDB Connection Failed");
        console.error("Full Error Details:", err.message);
        // Don't exit process, let server try to stay alive for debugging
    }
};

connectDB();

module.exports = mongoose.connection;