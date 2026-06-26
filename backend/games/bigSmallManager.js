const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { checkReferralReward } = require("../utils/referral");

class BigSmallManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 20;
        this.bets = []; // { userId, name, prediction, amount }
        this.history = [];
        this.forcedResult = null;
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

        let d1, d2, d3, total, result;

        if (this.forcedResult) {
            result = this.forcedResult;
            if (result === 'SMALL') {
                d1 = 1; d2 = 2; d3 = 1; total = 4;
            } else if (result === 'BIG') {
                d1 = 6; d2 = 5; d3 = 6; total = 17;
            } else {
                d1 = 3; d2 = 3; d3 = 3; total = 9;
            }
        } else if (this.autoOpen) {
            const bigVol = this.bets.filter(b => b.prediction === 'BIG').reduce((a, b) => a + b.amount, 0);
            const smallVol = this.bets.filter(b => b.prediction === 'SMALL').reduce((a, b) => a + b.amount, 0);
            const tripleVol = this.bets.filter(b => b.prediction === 'TRIPLE').reduce((a, b) => a + b.amount, 0);

            if (smallVol <= bigVol && smallVol <= tripleVol) {
                result = 'SMALL'; d1 = 1; d2 = 2; d3 = 1; total = 4;
            } else if (bigVol <= smallVol && bigVol <= tripleVol) {
                result = 'BIG'; d1 = 6; d2 = 5; d3 = 6; total = 17;
            } else {
                result = 'TRIPLE'; d1 = 3; d2 = 3; d3 = 3; total = 9;
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
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount }, referral_played: true });
                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount,
                    type: "game_win",
                    game_name: "Big Small",
                    details: `Won on ${bet.prediction}. Result: ${total} (${result})`
                }).save();
            } else {
                await User.findByIdAndUpdate(bet.userId, { referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_loss",
                    game_name: "Big Small",
                    details: `Lost on ${bet.prediction}. Result: ${total} (${result})`
                }).save();
            }
        }

        await Admin.findOneAndUpdate({}, { $inc: { balance: totalBetAmount - totalPayout } });

        this.history.unshift({ roundId: this.roundId, total, result, dice: [d1, d2, d3], time: new Date() });
        if (this.history.length > 500) this.history.pop();

        setTimeout(() => {
            this.roundId = Date.now();
            this.timer = 20;
            this.bets = [];
            this.forcedResult = null;
            this.isResolving = false;
        }, 5000);
    }

    placeBet(userId, name, prediction, amount) {
        if (this.timer < 3) return { success: false, message: "Round starting" };
        this.bets.push({ userId, name, prediction: prediction.toUpperCase(), amount: Number(amount) });
        return { success: true };
    }

    getGameState() {
        const stats = { BIG: 0, SMALL: 0, TRIPLE: 0, total: 0 };
        this.bets.forEach(b => {
            stats[b.prediction] += b.amount;
            stats.total += b.amount;
        });
        return {
            roundId: this.roundId,
            timer: this.timer,
            history: this.history,
            bets: this.bets, // Return full bets array
            activeBets: this.bets.length,
            BIG: stats.BIG,
            SMALL: stats.SMALL,
            TRIPLE: stats.TRIPLE,
            totalBet: stats.total
        };
    }
}

module.exports = new BigSmallManager();
