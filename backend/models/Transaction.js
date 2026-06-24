const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    type: { type: String, required: true }, // 'deposit', 'withdraw', 'game_win', 'game_loss', 'bonus', 'referral'
    game_name: { type: String, default: null },
    status: { type: String, default: 'completed' }, // 'pending', 'completed', 'rejected'
    commission: { type: Number, default: 0 },
    details: { type: String },
    rejection_reason: { type: String, default: null },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Transaction", TransactionSchema);