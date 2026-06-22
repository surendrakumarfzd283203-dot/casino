const mongoose = require("mongoose");
require("dotenv").config();

// Use MONGODB_URI from environment variables, with a fallback
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sachinku1259_db_user:Va9AEm8sLgW0mgG0@cluster0.kgokl91.mongodb.net/solo_casino?retryWrites=true&w=majority";

const connectDB = async () => {
    try {
        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB Connected Successfully");
    } catch (err) {
        console.error("❌ MongoDB Connection Failed:", err.message);
    }
};

connectDB();

module.exports = mongoose.connection;