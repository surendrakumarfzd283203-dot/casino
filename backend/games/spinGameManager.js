const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { checkReferralReward } = require("../utils/referral");

class SpinGameManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 20;
        this.bets = []; // { userId, name, amount }
        this.history = [];
        this.forcedResult = null;
        this.isResolving = false;

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
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount }, referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount,
                    type: "game_win",
                    game_name: "Spin Game",
                    details: `Won ${multiplier}x`
                }).save();
            } else {
                await User.findByIdAndUpdate(bet.userId, { referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_loss",
                    game_name: "Spin Game",
                    details: `Lost`
                }).save();
            }
        }

        const netProfit = totalBetAmount - totalPayout;
        await Admin.findOneAndUpdate({}, { $inc: { balance: netProfit } });

        this.history.unshift({ roundId: this.roundId, index: resultIndex, multiplier, time: new Date() });
        if (this.history.length > 50) this.history.pop();

        this.roundId = Date.now();
        this.timer = 20;
        this.bets = [];
        this.forcedResult = null;
        this.isResolving = false;
    }

    placeBet(userId, name, amount) {
        if (this.timer < 3) return { success: false, message: "Spinning soon" };
        this.bets.push({ userId, name, amount: Number(amount) });
        return { success: true };
    }

    getGameState() {
        return {
            roundId: this.roundId,
            timer: this.timer,
            history: this.history,
            sections: this.sections,
            totalBet: this.bets.reduce((a, b) => a + b.amount, 0),
            activeBets: this.bets.length
        };
    }

    forceResult(index) {
        this.forcedResult = Number(index);
    }
}

module.exports = new SpinGameManager();
