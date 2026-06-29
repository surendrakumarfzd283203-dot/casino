const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { checkReferralReward } = require("../utils/referral");

class ColorGameManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 25; // 20 seconds betting + 5 seconds waiting
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
            // Logic: Admin always wins. Pick result with lowest total payout.
            const potentialPayouts = {};
            for (let n = 1; n <= 20; n++) {
                potentialPayouts[n] = 0;
                const nColor = this.colors[n];
                const nSize = n <= 10 ? 'SMALL' : 'BIG';

                this.bets.forEach(b => {
                    if (b.type === 'NUMBER' && Number(b.value) === n) {
                        potentialPayouts[n] += b.amount * 18;
                    } else if (b.type === 'COLOR' && b.value === nColor) {
                        potentialPayouts[n] += b.amount * 4.5;
                    } else if (b.type === 'SIZE' && b.value === nSize) {
                        potentialPayouts[n] += b.amount * 1.95;
                    }
                });
            }

            // Find numbers with minimum payout
            const minPayout = Math.min(...Object.values(potentialPayouts));
            const bestNumbers = Object.keys(potentialPayouts).filter(n => potentialPayouts[n] === minPayout);

            // Randomly pick one from the best outcomes
            resultNumber = Number(bestNumbers[Math.floor(Math.random() * bestNumbers.length)]);
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
        this.timer = 25;
        this.bets = [];
        this.forcedResult = null;
        this.isResolving = false;
    }

    placeBet(userId, name, type, value, amount) {
        if (this.timer <= 5) return { success: false, message: "Round closing" };
        const betAmount = Number(amount);
        if (betAmount < 10) return { success: false, message: "Minimum bet is 10" };
        this.bets.push({ userId, name, type, value, amount: betAmount });
        return { success: true };
    }

    cancelLastBet(userId) {
        if (this.timer <= 5) return { success: false, message: "Round closing, cannot cancel" };
        // Find last bet from this user
        const lastIndex = [...this.bets].reverse().findIndex(b => b.userId.toString() === userId.toString());
        if (lastIndex === -1) return { success: false, message: "No bet to cancel" };

        const actualIndex = this.bets.length - 1 - lastIndex;
        const bet = this.bets[actualIndex];
        this.bets.splice(actualIndex, 1);
        return { success: true, amount: bet.amount };
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
