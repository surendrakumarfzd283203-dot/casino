const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    type: { type: String, required: true },
    details: { type: String },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Transaction", TransactionSchema);