// Teen Patti Game Logic
// 3-card hand game with player vs dealer

const getCardValue = (card) => {
    const rank = card.rank;
    if (rank === 'A') return 14;
    if (rank === 'K') return 13;
    if (rank === 'Q') return 12;
    if (rank === 'J') return 11;
    return parseInt(rank);
};

const generateDeck = () => {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (let suit of suits) {
        for (let rank of ranks) {
            deck.push({ suit, rank });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
};

const evaluateHand = (cards) => {
    const values = cards.map(c => getCardValue(c)).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    
    // Check for Trio (Three of a kind)
    if (values[0] === values[1] && values[1] === values[2]) {
        return { rank: 'Trio', score: values[0] * 1000 };
    }
    
    // Check for Straight Flush
    if (suits[0] === suits[1] && suits[1] === suits[2] &&
        values[0] - values[1] === 1 && values[1] - values[2] === 1) {
        return { rank: 'Straight Flush', score: values[0] * 100 + 50 };
    }
    
    // Check for Flush
    if (suits[0] === suits[1] && suits[1] === suits[2]) {
        return { rank: 'Flush', score: values[0] * 10 + 5 };
    }
    
    // Check for Straight
    if (values[0] - values[1] === 1 && values[1] - values[2] === 1) {
        return { rank: 'Straight', score: values[0] * 100 };
    }
    
    // Check for Pair
    if (values[0] === values[1] || values[1] === values[2]) {
        return { rank: 'Pair', score: Math.max(values[0], values[1]) * 10 };
    }
    
    // High Card
    return { rank: 'High Card', score: values[0] };
};

const playTeenPatti = (betAmount) => {
    const deck = generateDeck();
    
    // Deal 3 cards to player and dealer
    const playerCards = deck.slice(0, 3);
    const dealerCards = deck.slice(3, 6);
    
    const playerHand = evaluateHand(playerCards);
    const dealerHand = evaluateHand(dealerCards);
    
    let result, winAmount;
    
    if (playerHand.score > dealerHand.score) {
        result = 'WIN';
        winAmount = Math.floor(betAmount * 1.8);
    } else if (playerHand.score < dealerHand.score) {
        result = 'LOSE';
        winAmount = 0;
    } else {
        result = 'TIE';
        winAmount = betAmount;
    }
    
    return {
        result,
        playerCards,
        playerHand: playerHand.rank,
        dealerCards,
        dealerHand: dealerHand.rank,
        betAmount,
        winAmount,
        profit: winAmount - betAmount
    };
};

module.exports = { playTeenPatti, evaluateHand };
