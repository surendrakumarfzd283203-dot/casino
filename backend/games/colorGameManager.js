const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class ColorGameManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 180; // 3 minutes
        this.bets = []; // { userId, type, value, amount, name }
        this.history = [];
        this.forcedResult = null; // { number: x }
        this.autoOpen = false;
        this.isResolving = false;

        // Colors mapping: 1-20
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
            // Find numbers with 0 total bet
            const betTotals = {};
            for (let i = 1; i <= 20; i++) betTotals[i] = 0;

            this.bets.forEach(b => {
                if (b.type === 'NUMBER') betTotals[b.value] += b.amount;
                if (b.type === 'COLOR') {
                    for (let n in this.colors) {
                        if (this.colors[n] === b.value) betTotals[n] += b.amount / 4; // Weighted approximation
                    }
                }
                if (b.type === 'SIZE') {
                    const isSmall = b.value === 'SMALL';
                    for (let i = 1; i <= 20; i++) {
                        if (isSmall && i <= 11) betTotals[i] += b.amount / 11;
                        if (!isSmall && i > 11) betTotals[i] += b.amount / 9;
                    }
                }
            });

            const zeroBetNumbers = Object.keys(betTotals).filter(n => betTotals[n] === 0);
            if (zeroBetNumbers.length > 0) {
                resultNumber = Number(zeroBetNumbers[Math.floor(Math.random() * zeroBetNumbers.length)]);
            } else {
                // Pick number with minimum bet
                resultNumber = Number(Object.keys(betTotals).reduce((a, b) => betTotals[a] < betTotals[b] ? a : b));
            }
        } else {
            resultNumber = Math.floor(Math.random() * 20) + 1;
        }

        const resultColor = this.colors[resultNumber];
        const resultSize = resultNumber <= 11 ? 'SMALL' : 'BIG';

        const winners = [];
        let totalPayout = 0;
        let totalBetAmount = 0;

        for (let bet of this.bets) {
            totalBetAmount += bet.amount;
            let isWin = false;
            let multiplier = 0;

            if (bet.type === 'NUMBER' && Number(bet.value) === resultNumber) {
                isWin = true;
                multiplier = 18; // 18x for number
            } else if (bet.type === 'COLOR' && bet.value === resultColor) {
                isWin = true;
                multiplier = 4.5; // 4.5x for color
            } else if (bet.type === 'SIZE' && bet.value === resultSize) {
                isWin = true;
                multiplier = 1.95; // 1.95x for size
            }

            if (isWin) {
                const winAmount = Math.floor(bet.amount * multiplier);
                totalPayout += winAmount;
                winners.push({ userId: bet.userId, amount: winAmount, betType: bet.type });

                // Update User Balance
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount } });

                // Log Transaction
                const txn = new Transaction({
                    user_id: bet.userId,
                    amount: winAmount - bet.amount,
                    type: "game_color_number",
                    details: `Round ${this.roundId} WIN. Result: ${resultNumber} (${resultColor})`
                });
                await txn.save();
            } else {
                const txn = new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_color_number",
                    details: `Round ${this.roundId} LOSE. Result: ${resultNumber} (${resultColor})`
                });
                await txn.save();
            }
        }

        // Update Admin Balance
        const netProfit = totalBetAmount - totalPayout;
        await Admin.findOneAndUpdate({}, { $inc: { balance: netProfit } });

        this.history.unshift({
            roundId: this.roundId,
            number: resultNumber,
            color: resultColor,
            size: resultSize,
            time: new Date()
        });
        if (this.history.length > 20) this.history.pop();

        // Reset for next round
        this.roundId = Date.now();
        this.timer = 180;
        this.bets = [];
        this.forcedResult = null;
        this.isResolving = false;
    }

    placeBet(userId, name, type, value, amount) {
        if (this.timer < 5) return { success: false, message: "Round ending soon, cannot bet" };
        this.bets.push({ userId, name, type, value, amount: Number(amount) });
        return { success: true };
    }

    getGameState() {
        return {
            roundId: this.roundId,
            timer: this.timer,
            history: this.history,
            colors: this.colors
        };
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
