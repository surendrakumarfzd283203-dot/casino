const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class BigSmallManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 20; // 20 seconds
        this.bets = []; // { userId, name, prediction, amount }
        this.history = [];
        this.forcedResult = null; // 'BIG', 'SMALL', or 'TRIPLE'
        this.autoOpen = false;
        this.isResolving = false;

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

        // Rolling 3 dice (1-6)
        let d1, d2, d3, total, result;

        if (this.forcedResult) {
            result = this.forcedResult;
            if (result === 'SMALL') {
                // Force total 3-10
                d1 = 1; d2 = 2; d3 = 1; total = 4;
            } else {
                // Force total 11-18
                d1 = 6; d2 = 5; d3 = 6; total = 17;
            }
        } else if (this.autoOpen) {
            const bigVol = this.bets.filter(b => b.prediction === 'BIG').reduce((a, b) => a + b.amount, 0);
            const smallVol = this.bets.filter(b => b.prediction === 'SMALL').reduce((a, b) => a + b.amount, 0);

            if (bigVol < smallVol) {
                result = 'BIG'; d1 = 6; d2 = 5; d3 = 6; total = 17;
            } else {
                result = 'SMALL'; d1 = 1; d2 = 2; d3 = 1; total = 4;
            }
        } else {
            d1 = Math.floor(Math.random() * 6) + 1;
            d2 = Math.floor(Math.random() * 6) + 1;
            d3 = Math.floor(Math.random() * 6) + 1;
            total = d1 + d2 + d3;

            if (d1 === d2 && d2 === d3) result = 'TRIPLE';
            else result = total <= 10 ? 'SMALL' : 'BIG';
        }

        let totalPayout = 0;
        let totalBetAmount = 0;

        for (let bet of this.bets) {
            totalBetAmount += bet.amount;
            if (bet.prediction === result) {
                const multiplier = result === 'TRIPLE' ? 24 : 1.95;
                const winAmount = Math.floor(bet.amount * multiplier);
                totalPayout += winAmount;
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount } });
                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount - bet.amount,
                    type: "game_bigsmall",
                    details: `Round ${this.roundId} WIN. Result: ${total} (${result})`
                }).save();
            } else {
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_bigsmall",
                    details: `Round ${this.roundId} LOSE. Result: ${total} (${result})`
                }).save();
            }
        }

        await Admin.findOneAndUpdate({}, { $inc: { balance: totalBetAmount - totalPayout } });

        this.history.unshift({ roundId: this.roundId, total, result, dice: [d1, d2, d3] });
        if (this.history.length > 20) this.history.pop();

        this.roundId = Date.now();
        this.timer = 20;
        this.bets = [];
        this.forcedResult = null;
        this.isResolving = false;
    }

    placeBet(userId, name, prediction, amount) {
        if (this.timer < 5) return { success: false, message: "Round starting soon" };
        this.bets.push({ userId, name, prediction: prediction.toUpperCase(), amount: Number(amount) });
        return { success: true };
    }

    getGameState() {
        return { roundId: this.roundId, timer: this.timer, history: this.history, activeBets: this.bets };
    }
}

module.exports = new BigSmallManager();
