const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { checkReferralReward } = require("../utils/referral");

class ColorGameManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 39; // 30 seconds betting + 9 seconds waiting
        this.bets = []; // { userId, type, value, amount, name }
        this.history = [];
        this.forcedResult = null; // { number: x }
        this.autoOpen = false;
        this.isResolving = false;

        this.colors = {
            1: "RED", 2: "BLUE", 3: "GREEN", 4: "YELLOW", 5: "VIOLET",
            6: "RED", 7: "BLUE", 8: "GREEN", 9: "YELLOW", 10: "VIOLET",
            11: "RED", 12: "BLUE", 13: "GREEN", 14: "YELLOW", 15: "VIOLET",
            16: "RED", 17: "BLUE", 18: "GREEN", 19: "YELLOW", 20: "VIOLET"
        };

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

        let resultNumber;
        if (this.forcedResult && this.forcedResult.number) {
            resultNumber = this.forcedResult.number;
        } else if (this.autoOpen) {
            const betTotals = {};
            for (let i = 1; i <= 20; i++) betTotals[i] = 0;

            this.bets.forEach(b => {
                if (b.type === 'NUMBER') betTotals[b.value] += b.amount;
                if (b.type === 'COLOR') {
                    for (let n in this.colors) {
                        if (this.colors[n] === b.value) betTotals[n] += b.amount / 4;
                    }
                }
                if (b.type === 'SIZE') {
                    const isSmall = b.value === 'SMALL';
                    for (let i = 1; i <= 20; i++) {
                        if (isSmall && i <= 10) betTotals[i] += b.amount / 10;
                        if (!isSmall && i > 10) betTotals[i] += b.amount / 10;
                    }
                }
            });

            const zeroBetNumbers = Object.keys(betTotals).filter(n => betTotals[n] === 0);
            if (zeroBetNumbers.length > 0) {
                resultNumber = Number(zeroBetNumbers[Math.floor(Math.random() * zeroBetNumbers.length)]);
            } else {
                resultNumber = Number(Object.keys(betTotals).reduce((a, b) => betTotals[a] < betTotals[b] ? a : b));
            }
        } else {
            resultNumber = Math.floor(Math.random() * 20) + 1;
        }

        const resultColor = this.colors[resultNumber];
        const resultSize = resultNumber <= 10 ? 'SMALL' : 'BIG';

        let totalPayout = 0;
        let totalBetAmount = 0;

        for (let bet of this.bets) {
            totalBetAmount += bet.amount;
            let isWin = false;
            let multiplier = 0;

            if (bet.type === 'NUMBER' && Number(bet.value) === resultNumber) {
                isWin = true;
                multiplier = 18;
            } else if (bet.type === 'COLOR' && bet.value === resultColor) {
                isWin = true;
                multiplier = 4.5;
            } else if (bet.type === 'SIZE' && bet.value === resultSize) {
                isWin = true;
                multiplier = 1.95;
            }

            if (isWin) {
                const winAmount = Math.floor(bet.amount * multiplier);
                totalPayout += winAmount;
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount }, referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount,
                    type: "game_win",
                    game_name: "Color Game",
                    details: `Won on ${bet.type} ${bet.value}. Result: ${resultNumber}`
                }).save();
            } else {
                await User.findByIdAndUpdate(bet.userId, { referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_loss",
                    game_name: "Color Game",
                    details: `Lost on ${bet.type} ${bet.value}. Result: ${resultNumber}`
                }).save();
            }
        }

        await Admin.findOneAndUpdate({}, { $inc: { balance: totalBetAmount - totalPayout } });

        this.history.unshift({
            roundId: this.roundId,
            number: resultNumber,
            color: resultColor,
            size: resultSize,
            time: new Date()
        });
        if (this.history.length > 500) this.history.pop(); // Keep more history

        this.roundId = Date.now();
        this.timer = 39;
        this.bets = [];
        this.forcedResult = null;
        this.isResolving = false;
    }

    placeBet(userId, name, type, value, amount) {
        if (this.timer <= 9) return { success: false, message: "Round closing" };
        this.bets.push({ userId, name, type, value, amount: Number(amount) });
        return { success: true };
    }

    getGameState() {
        return {
            roundId: this.roundId,
            timer: this.timer,
            history: this.history,
            colors: this.colors,
            betStats: this.getBetStats()
        };
    }

    getBetStats() {
        const stats = {
            colors: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0, VIOLET: 0 },
            numbers: {},
            sizes: { BIG: 0, SMALL: 0 },
            totalBet: 0
        };
        for (let i = 1; i <= 20; i++) stats.numbers[i] = 0;

        this.bets.forEach(b => {
            stats.totalBet += b.amount;
            if (b.type === 'COLOR') stats.colors[b.value] += b.amount;
            if (b.type === 'NUMBER') stats.numbers[b.value] += b.amount;
            if (b.type === 'SIZE') stats.sizes[b.value] += b.amount;
        });
        return stats;
    }

    getLiveBets() {
        return this.bets;
    }

    forceNextResult(number) {
        this.forcedResult = { number: Number(number) };
    }

    toggleAutoOpen(status) {
        this.autoOpen = status;
    }
}

module.exports = new ColorGameManager();
