const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class SpinGameManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 20; // 20 second rounds
        this.bets = []; // { userId, name, amount }
        this.history = [];
        this.forcedResult = null; // { index: x }
        this.isResolving = false;

        // Sections: [multiplier, color]
        this.sections = [
            [0, "GRAY"], [2, "RED"], [0, "GRAY"], [5, "BLUE"],
            [0, "GRAY"], [2, "RED"], [0, "GRAY"], [10, "GOLD"],
            [0, "GRAY"], [2, "RED"], [0, "GRAY"], [5, "BLUE"]
        ];

        this.startTimer();
    }

    startTimer() {
        setInterval(() => {
            if (this.timer > 0) {
                this.timer--;
            } else {
                if (!this.isResolving) {
                    this.resolveRound();
                }
            }
        }, 1000);
    }

    async resolveRound() {
        this.isResolving = true;

        let resultIndex;
        if (this.forcedResult !== null) {
            resultIndex = this.forcedResult;
        } else {
            resultIndex = Math.floor(Math.random() * this.sections.length);
        }

        const multiplier = this.sections[resultIndex][0];
        let totalBetAmount = 0;
        let totalPayout = 0;

        for (let bet of this.bets) {
            totalBetAmount += bet.amount;
            const winAmount = Math.floor(bet.amount * multiplier);

            if (winAmount > 0) {
                totalPayout += winAmount;
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount } });
                const txn = new Transaction({
                    user_id: bet.userId,
                    amount: winAmount - bet.amount,
                    type: "game_spin",
                    details: `Round ${this.roundId} WIN ${multiplier}x`
                });
                await txn.save();
            } else {
                const txn = new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_spin",
                    details: `Round ${this.roundId} LOSE`
                });
                await txn.save();
            }
        }

        const netProfit = totalBetAmount - totalPayout;
        await Admin.findOneAndUpdate({}, { $inc: { balance: netProfit } });

        this.history.unshift({ roundId: this.roundId, index: resultIndex, multiplier, time: new Date() });
        if (this.history.length > 20) this.history.pop();

        this.roundId = Date.now();
        this.timer = 20;
        this.bets = [];
        this.forcedResult = null;
        this.isResolving = false;
    }

    placeBet(userId, name, amount) {
        if (this.timer < 5) return { success: false, message: "Spinning soon" };
        this.bets.push({ userId, name, amount: Number(amount) });
        return { success: true };
    }

    getGameState() {
        return { roundId: this.roundId, timer: this.timer, history: this.history, sections: this.sections };
    }

    forceResult(index) {
        this.forcedResult = Number(index);
    }
}

module.exports = new SpinGameManager();
