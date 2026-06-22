const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 10 },
    status: { type: String, default: "active" },
    avatar: { type: String, default: null },
    last_bonus: { type: Date, default: null },
    lucky_draw_streak: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);