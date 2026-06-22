const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class LuckyDrawManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 20; // 20 seconds rounds
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
            // Generate random result
            // 2% chance for 777
            // 15% chance for a "Pair" like 112, 553
            // Otherwise random
            const rand = Math.random();
            if (rand < 0.02) result = "777";
            else if (rand < 0.17) {
                const digit = Math.floor(Math.random() * 10);
                const other = Math.floor(Math.random() * 10);
                result = `${digit}${digit}${other}`;
            } else {
                result = Math.floor(Math.random() * 900 + 100).toString();
                if (result === "777") result = "778"; // Avoid accidental jackpot
            }
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
                winAmount = bet.amount * 10;
            } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
                // Any pair wins 2x
                isWin = true;
                winAmount = Math.floor(bet.amount * 2);
            } else {
                // Real Luck: If sum of digits is even, 1.2x return (Low volatility win)
                const sum = parseInt(result[0]) + parseInt(result[1]) + parseInt(result[2]);
                if (sum % 2 === 0) {
                    isWin = true;
                    winAmount = Math.floor(bet.amount * 1.2);
                }
            }

            if (isWin) {
                totalPayout += winAmount;
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount } });
                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount - bet.amount,
                    type: "game_luckydraw",
                    details: `Lucky Draw WIN. Result: ${result}`
                }).save();
            } else {
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_luckydraw",
                    details: `Lucky Draw LOSE. Result: ${result}`
                }).save();
            }
        }

        const netProfit = totalBetAmount - totalPayout;
        await Admin.findOneAndUpdate({}, { $inc: { balance: netProfit } });

        this.history.unshift({ roundId: this.roundId, result, time: new Date() });
        if (this.history.length > 20) this.history.pop();

        this.roundId = Date.now();
        this.timer = 20;
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
        return { roundId: this.roundId, timer: this.timer, history: this.history, activeBets: this.bets.length };
    }

    forceJackpot() {
        this.forcedJackpot = true;
    }
}

module.exports = new LuckyDrawManager();
