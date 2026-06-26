const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { checkReferralReward } = require("../utils/referral");

class NumberSpinManager {
    constructor() {
        this.roundId = Date.now();
        this.timer = 15; // 15 seconds betting time
        this.isSpinning = false;
        this.spinTimer = 0; // 5 seconds spin/result time
        this.bets = []; // { userId, name, selection, amount }
        this.history = [];
        this.forcedResult = null;
        this.autoMode = true; // Auto mode: picks result with minimum payout

        // Numbers on the wheel as per typical 2-dice sum distribution but image shows 2-12
        this.numbers = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

        // Distribution for more realism (7 is most common if it were dice, but let's keep it simple or based on image)
        // The image shows a wheel with sections. Let's define the wheel sections.
        this.wheelSections = [7, 2, 8, 3, 9, 4, 10, 5, 11, 6, 12];

        this.startTimer();
    }

    startTimer() {
        setInterval(() => {
            if (this.timer > 0) {
                this.timer--;
            } else if (this.spinTimer > 0) {
                this.spinTimer--;
            } else {
                if (!this.isSpinning) {
                    this.resolveRound();
                } else {
                    // Reset for next round
                    this.roundId = Date.now();
                    this.timer = 15;
                    this.spinTimer = 0;
                    this.bets = [];
                    this.forcedResult = null;
                    this.isSpinning = false;
                }
            }
        }, 1000);
    }

    async resolveRound() {
        this.isSpinning = true;
        this.spinTimer = 5; // Result/Spin display for 5 seconds

        let result;
        if (this.forcedResult !== null) {
            result = this.forcedResult;
        } else if (this.autoMode) {
            // Admin control: choose result with minimum payout
            result = this.getAdminControlledResult();
        } else {
            // Random result if autoMode is off and no forced result
            result = this.numbers[Math.floor(Math.random() * this.numbers.length)];
        }

        const winningNumber = result;
        let totalBetAmount = 0;
        let totalPayout = 0;

        for (let bet of this.bets) {
            totalBetAmount += bet.amount;
            let multiplier = 0;

            if (bet.selection === 'DOWN' && winningNumber >= 2 && winningNumber <= 6) multiplier = 2;
            else if (bet.selection === 'MIDDLE' && winningNumber === 7) multiplier = 5; // 1:4 payout means 5x total
            else if (bet.selection === 'UP' && winningNumber >= 8 && winningNumber <= 12) multiplier = 2;
            else if (parseInt(bet.selection) === winningNumber) multiplier = 10; // Individual number payout 1:9

            const winAmount = Math.floor(bet.amount * multiplier);

            if (winAmount > 0) {
                totalPayout += winAmount;
                await User.findByIdAndUpdate(bet.userId, { $inc: { coins: winAmount }, referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount,
                    type: "game_win",
                    game_name: "Number Spin",
                    details: `Won on ${winningNumber} with ${bet.selection}`
                }).save();
            } else {
                await User.findByIdAndUpdate(bet.userId, { referral_played: true });
                await checkReferralReward(bet.userId);
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.amount,
                    type: "game_loss",
                    game_name: "Number Spin",
                    details: `Lost on ${winningNumber}`
                }).save();
            }
        }

        const netProfit = totalBetAmount - totalPayout;
        await Admin.findOneAndUpdate({}, { $inc: { balance: netProfit } });

        this.history.unshift({ roundId: this.roundId, result: winningNumber, time: new Date() });
        if (this.history.length > 20) this.history.pop();
    }

    getAdminControlledResult() {
        const betTotals = {};
        this.numbers.forEach(n => betTotals[n] = 0);

        // Calculate total payout for each possible winning number (2-12)
        let payouts = this.numbers.map(n => {
            let totalPayout = 0;
            for (let bet of this.bets) {
                let multiplier = 0;
                if (bet.selection === 'DOWN' && n >= 2 && n <= 6) multiplier = 2;
                else if (bet.selection === 'MIDDLE' && n === 7) multiplier = 5;
                else if (bet.selection === 'UP' && n >= 8 && n <= 12) multiplier = 2;
                else if (parseInt(bet.selection) === n) multiplier = 10;
                totalPayout += bet.amount * multiplier;
            }
            return { number: n, payout: totalPayout };
        });

        // Sort by payout ascending
        payouts.sort((a, b) => a.payout - b.payout);

        const minPayout = payouts[0].payout;
        let candidates = payouts.filter(p => p.payout === minPayout).map(p => p.number);

        // To avoid repeating the same number too often, filter out the last result if possible
        const lastResult = this.history.length > 0 ? this.history[0].result : null;
        if (candidates.length > 1 && lastResult !== null) {
            candidates = candidates.filter(n => n !== lastResult);
        }

        // Return a random number from the candidates
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    placeBet(userId, name, selection, amount) {
        if (this.timer < 1 || this.isSpinning) return { success: false, message: "Bets locked" };
        this.bets.push({ userId, name, selection, amount: Number(amount) });
        return { success: true };
    }

    getGameState() {
        const numBets = {};
        [2,3,4,5,6,8,9,10,11,12].forEach(n => {
            numBets[n] = this.bets.filter(b => b.selection === n.toString()).reduce((a, b) => a + b.amount, 0);
        });

        return {
            roundId: this.roundId,
            timer: this.timer,
            isSpinning: this.isSpinning,
            history: this.history,
            wheelSections: this.wheelSections,
            totalBet: this.bets.reduce((a, b) => a + b.amount, 0),
            activeBets: this.bets.length,
            downBets: this.bets.filter(b => b.selection === 'DOWN').reduce((a, b) => a + b.amount, 0),
            midBets: this.bets.filter(b => b.selection === 'MIDDLE').reduce((a, b) => a + b.amount, 0),
            upBets: this.bets.filter(b => b.selection === 'UP').reduce((a, b) => a + b.amount, 0),
            numBets: numBets
        };
    }

    forceResult(number) {
        this.forcedResult = Number(number);
    }

    toggleAutoMode(mode) {
        this.autoMode = !!mode;
    }
}

module.exports = new NumberSpinManager();
