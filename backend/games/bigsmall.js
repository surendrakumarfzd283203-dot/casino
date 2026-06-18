// Admin Controlled Big Small Logic

const playBigSmall = (betAmount, prediction, forcedResult = null) => {
    let dice1, dice2, dice3, total, actualResult;

    if (forcedResult) {
        // Manipulate dice to match forced result
        actualResult = forcedResult.toUpperCase();
        if (actualResult === 'SMALL') {
            // Total must be 3-10
            dice1 = 1; dice2 = 1; dice3 = 1; // 3
        } else {
            // Total must be 11-18
            dice1 = 6; dice2 = 6; dice3 = 6; // 18
        }
        total = dice1 + dice2 + dice3;
    } else {
        // Random dice
        dice1 = Math.floor(Math.random() * 6) + 1;
        dice2 = Math.floor(Math.random() * 6) + 1;
        dice3 = Math.floor(Math.random() * 6) + 1;
        total = dice1 + dice2 + dice3;
        actualResult = total <= 10 ? 'SMALL' : 'BIG';
    }

    let result, winAmount;
    const normalizedPrediction = (prediction || '').toUpperCase();

    if (normalizedPrediction === actualResult) {
        result = 'WIN';
        winAmount = Math.floor(betAmount * 1.95);
    } else {
        result = 'LOSE';
        winAmount = 0;
    }

    return {
        result,
        betAmount,
        winAmount,
        profit: winAmount - betAmount,
        diceRolls: [dice1, dice2, dice3],
        total,
        yourPrediction: normalizedPrediction,
        actualResult
    };
};

module.exports = { playBigSmall };
