const mongoose = require("mongoose");

const DepositRequestSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    payment_method: { type: String, required: true },
    details: { type: String },
    status: { type: String, default: "pending" },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("DepositRequest", DepositRequestSchema);