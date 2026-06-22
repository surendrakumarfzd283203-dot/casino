const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class LuckyDrawManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 60; // 1 minute rounds
        this.bets = []; // { userId, name, amount }
        this.history = [];
        this.forcedJackpot = false;
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

        let result;
        if (this.forcedJackpot) {
            result = "777";
        } else {
            // Generate random result that is NOT 777
            let res = Math.floor(Math.random() * 900) + 100;
            while (res === 777) {
                res = Math.floor(Math.random() * 900) + 100;
            }
            result = res.toString();
        }

        let totalBetAmount = 0;
        let totalPayout = 0;

        for (let bet of this.bets) {
            totalBetAmount += bet.amount;
            const user = await User.findById(bet.userId);
            if (!user) continue;

            let isWin = false;
            let winAmount = 0;

            if (result === "777") {
                isWin = true;
                winAmount = bet.amount * 10; // Jackpot 10x
            } else {
                // Check user streak: 3 loses, 1 win
                if (user.lucky_draw_streak >= 3) {
                    isWin = true;
                    winAmount = Math.floor(bet.amount * 2);
                    user.lucky_draw_streak = 0;
                } else {
                    isWin = false;
                    user.lucky_draw_streak += 1;
                }
            }
            await user.save();

            if (isWin) {
                totalPayout += winAmount;
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount } });
                const txn = new Transaction({
                    user_id: bet.userId,
                    amount: winAmount - bet.amount,
                    type: "game_luckydraw",
                    details: `Round ${this.roundId} WIN. Result: ${result}`
                });
                await txn.save();
            } else {
                const txn = new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_luckydraw",
                    details: `Round ${this.roundId} LOSE. Result: ${result}`
                });
                await txn.save();
            }
        }

        const netProfit = totalBetAmount - totalPayout;
        await Admin.findOneAndUpdate({}, { $inc: { balance: netProfit } });

        this.history.unshift({ roundId: this.roundId, result, time: new Date() });
        if (this.history.length > 20) this.history.pop();

        this.roundId = Date.now();
        this.timer = 60;
        this.bets = [];
        this.forcedJackpot = false;
        this.isResolving = false;
    }

    placeBet(userId, name, amount) {
        if (this.timer < 5) return { success: false, message: "Round ending" };
        this.bets.push({ userId, name, amount: Number(amount) });
        return { success: true };
    }

    getGameState() {
        return { roundId: this.roundId, timer: this.timer, history: this.history };
    }

    forceJackpot() {
        this.forcedJackpot = true;
    }
}

module.exports = new LuckyDrawManager();
