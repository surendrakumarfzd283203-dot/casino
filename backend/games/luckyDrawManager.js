const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { checkReferralReward } = require("../utils/referral");

class LuckyDrawManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 20;
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
                    this.resolveRound();
                }
            }
        }, 1000);
    }

    async resolveRound() {
        this.isResolving = true;

        let result;
        if (this.forcedResult !== null) {
            result = this.forcedResult.toString().padStart(3, '0');
        } else {
            // Auto mode: find result with minimum payout
            result = this.getAdminControlledResult();
        }

        const sum = result.split('').reduce((a, b) => a + parseInt(b), 0);
        const isOdd = sum % 2 !== 0;

        let totalBetAmount = 0;
        let totalPayout = 0;

        for (let bet of this.bets) {
            totalBetAmount += bet.amount;
            let winAmount = 0;

            if (bet.selection === 'ODD' && isOdd) winAmount = bet.amount * 1.9;
            else if (bet.selection === 'EVEN' && !isOdd) winAmount = bet.amount * 1.9;
            else if (bet.selection === 'JACKPOT' && result === "777") winAmount = bet.amount * 50;
            else if (bet.selection === result) winAmount = bet.amount * 100; // Payout for exact 3 digits

            if (winAmount > 0) {
                totalPayout += winAmount;
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount }, referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount,
                    type: "game_win",
                    game_name: "Lucky Draw",
                    details: `Won on ${result} (${sum} ${isOdd ? 'ODD' : 'EVEN'})`
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
        this.timer = 20;
        this.bets = [];
        this.forcedResult = null;
        this.isResolving = false;
    }

    getAdminControlledResult() {
        // Try random results and pick one with minimum payout
        let minPayout = Infinity;
        let bestResult = "123";

        for (let i = 0; i < 20; i++) {
            const res = (Math.floor(Math.random() * 900) + 100).toString();
            const s = res.split('').reduce((a, b) => a + parseInt(b), 0);
            const o = s % 2 !== 0;

            let payout = 0;
            for (let bet of this.bets) {
                if (bet.selection === 'ODD' && o) payout += bet.amount * 1.9;
                else if (bet.selection === 'EVEN' && !o) payout += bet.amount * 1.9;
                else if (bet.selection === 'JACKPOT' && res === "777") payout += bet.amount * 50;
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
        if (this.timer < 3) return { success: false, message: "Round starting" };
        this.bets.push({ userId, name, amount: Number(amount), selection: selection || 'ODD' });
        return { success: true };
    }

    getGameState() {
        return {
            roundId: this.roundId,
            timer: this.timer,
            history: this.history,
            activeBets: this.bets.length,
            totalBet: this.bets.reduce((a, b) => a + b.amount, 0),
            oddBets: this.bets.filter(b => b.selection === 'ODD').reduce((a, b) => a + b.amount, 0),
            evenBets: this.bets.filter(b => b.selection === 'EVEN').reduce((a, b) => a + b.amount, 0),
            jackpotBets: this.bets.filter(b => b.selection === 'JACKPOT').reduce((a, b) => a + b.amount, 0)
        };
    }

    forceResult(res) {
        this.forcedResult = res;
    }
}

module.exports = new LuckyDrawManager();
