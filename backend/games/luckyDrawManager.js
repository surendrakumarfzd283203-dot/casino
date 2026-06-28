const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { checkReferralReward } = require("../utils/referral");

class LuckyDrawManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 10;
        this.bets = []; // { userId, name, amount, selection: 'ODD'|'EVEN'|'JACKPOT' }
        this.history = [];
        this.forcedResult = null;
        this.isResolving = false;

        this.startTimer();
    }

    startTimer() {
        setInterval(() => {
            if (this.timer > 0) {
                this.timer--;
            } else {
                if (!this.isResolving) {
                    this.startRollingPhase();
                }
            }
        }, 1000);
    }

    async startRollingPhase() {
        this.isResolving = true;
        // Broadcast "Resolving" state if we had sockets, but here we just wait
        setTimeout(() => {
            this.resolveRound();
        }, 3000); // 3 seconds of "rolling" animation time
    }

    async resolveRound() {
        // Calculation logic stays same...

        let result;
        if (this.forcedResult !== null) {
            result = this.forcedResult.toString().padStart(3, '0');
        } else {
            result = this.getAdminControlledResult();
        }

        const digits = result.split('').map(Number);
        const sum = digits.reduce((a, b) => a + b, 0);
        const isOdd = sum % 2 !== 0;

        // Check for Pair (Exactly 2 same digits) and Triple (All 3 same)
        const counts = {};
        digits.forEach(d => counts[d] = (counts[d] || 0) + 1);
        const maxCount = Math.max(...Object.values(counts));

        const hasTriple = maxCount === 3;
        const hasPair = maxCount >= 2; // Triple counts as a Pair logically in many games, but let's see

        let totalBetAmount = 0;
        let totalPayout = 0;

        for (let bet of this.bets) {
            totalBetAmount += bet.amount;
            let winAmount = 0;

            if (bet.selection === 'ODD' && isOdd) winAmount = bet.amount * 1.9;
            else if (bet.selection === 'EVEN' && !isOdd) winAmount = bet.amount * 1.9;
            else if (bet.selection === 'PAIR' && hasPair) winAmount = bet.amount * 2.5;
            else if (bet.selection === 'TRIPLE' && hasTriple) winAmount = bet.amount * 50;
            else if (bet.selection === 'JACKPOT' && result === "777") winAmount = bet.amount * 150;
            else if (bet.selection === result) winAmount = bet.amount * 100;

            if (winAmount > 0) {
                totalPayout += winAmount;
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount }, referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount,
                    type: "game_win",
                    game_name: "Lucky Draw",
                    details: `Won on ${result} (Sum: ${sum}, ${isOdd ? 'ODD' : 'EVEN'}) with ${bet.selection}`
                }).save();
            } else {
                await User.findByIdAndUpdate(bet.userId, { referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_loss",
                    game_name: "Lucky Draw",
                    details: `Lost on ${result}`
                }).save();
            }
        }

        await Admin.findOneAndUpdate({}, { $inc: { balance: totalBetAmount - totalPayout } });

        this.history.unshift({ roundId: this.roundId, result, sum, isOdd, time: new Date() });
        if (this.history.length > 50) this.history.pop();

        this.roundId = Date.now();
        this.timer = 10;
        this.bets = [];
        this.forcedResult = null;
        this.isResolving = false;
    }

    getAdminControlledResult() {
        let minPayout = Infinity;
        let bestResult = "123";

        for (let i = 0; i < 50; i++) {
            const res = (Math.floor(Math.random() * 1000)).toString().padStart(3, '0');
            const digits = res.split('').map(Number);
            const s = digits.reduce((a, b) => a + b, 0);
            const o = s % 2 !== 0;

            const counts = {};
            digits.forEach(d => counts[d] = (counts[d] || 0) + 1);
            const maxC = Math.max(...Object.values(counts));
            const hasT = maxC === 3;
            const hasP = maxC >= 2;

            let payout = 0;
            for (let bet of this.bets) {
                if (bet.selection === 'ODD' && o) payout += bet.amount * 1.9;
                else if (bet.selection === 'EVEN' && !o) payout += bet.amount * 1.9;
                else if (bet.selection === 'PAIR' && hasP) payout += bet.amount * 2.5;
                else if (bet.selection === 'TRIPLE' && hasT) payout += bet.amount * 50;
                else if (bet.selection === 'JACKPOT' && res === "777") payout += bet.amount * 150;
                else if (bet.selection === res) payout += bet.amount * 100;
            }

            if (payout < minPayout) {
                minPayout = payout;
                bestResult = res;
            }
        }
        return bestResult;
    }

    placeBet(userId, name, amount, selection) {
        if (this.timer < 3 || this.isResolving) return { success: false, message: "Round starting" };
        const betAmount = Number(amount);
        if (betAmount < 10) return { success: false, message: "Min bet is 10" };
        this.bets.push({ userId, name, amount: betAmount, selection: selection || 'ODD' });
        return { success: true };
    }

    cancelLastBet(userId) {
        if (this.timer < 3 || this.isResolving) return { success: false, message: "Cannot cancel now" };
        const lastIndex = [...this.bets].reverse().findIndex(b => b.userId.toString() === userId.toString());
        if (lastIndex === -1) return { success: false, message: "No bet to cancel" };

        const actualIndex = this.bets.length - 1 - lastIndex;
        const bet = this.bets[actualIndex];
        this.bets.splice(actualIndex, 1);
        return { success: true, amount: bet.amount };
    }

    getGameState() {
        const categories = ['ODD', 'EVEN', 'PAIR', 'TRIPLE', 'JACKPOT'];
        return {
            roundId: this.roundId,
            timer: this.timer,
            isResolving: this.isResolving,
            history: this.history,
            activeBetsCount: this.bets.length,
            totalBet: this.bets.reduce((a, b) => a + b.amount, 0),
            oddBets: this.bets.filter(b => b.selection === 'ODD').reduce((a, b) => a + b.amount, 0),
            evenBets: this.bets.filter(b => b.selection === 'EVEN').reduce((a, b) => a + b.amount, 0),
            pairBets: this.bets.filter(b => b.selection === 'PAIR').reduce((a, b) => a + b.amount, 0),
            tripleBets: this.bets.filter(b => b.selection === 'TRIPLE').reduce((a, b) => a + b.amount, 0),
            jackpotBets: this.bets.filter(b => b.selection === 'JACKPOT').reduce((a, b) => a + b.amount, 0),
            otherBets: this.bets.filter(b => !categories.includes(b.selection)).reduce((a, b) => a + b.amount, 0),
            bets: this.bets
        };
    }

    forceResult(res) {
        this.forcedResult = res;
    }
}

module.exports = new LuckyDrawManager();
