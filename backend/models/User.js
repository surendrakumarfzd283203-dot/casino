const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 0 },
    status: { type: String, default: "active" },
    avatar: { type: String, default: null },
    last_bonus: { type: Date, default: null },
    daily_bonus_count: { type: Number, default: 0 },
    referral_code: { type: String, unique: true },
    referred_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    referral_played: { type: Boolean, default: false }, // Has played at least one game
    total_deposited: { type: Number, default: 0 },
    referral_rewarded: { type: Boolean, default: false },
    kyc_status: { type: String, default: "pending" }, // pending, verified, rejected
    kyc_rejection_reason: { type: String, default: null },
    kyc_data: {
        full_name: { type: String, default: "" },
        aadhar_no: { type: String, default: "" },
        pan_no: { type: String, default: "" },
        account_no: { type: String, default: "" },
        ifsc_code: { type: String, default: "" }
    },
    lucky_draw_streak: { type: Number, default: 0 },
    last_seen: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);