// Advanced Teen Patti Manager for Multiplayer and Auto-Dealing
const { evaluateHand } = require("./teenpatti");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class TeenPattiTable {
    constructor(id) {
        this.id = id;
        this.players = {}; // { userId: { name, betAmount, hand: [], status: 'active'|'folded' } }
        this.dealerHand = [];
        this.state = 'WAITING'; // WAITING, BETTING, DEALING, RESOLVING
        this.timer = 0;
        this.maxPlayers = 6;
        this.forcedResult = null; // Admin control
    }

    reset() {
        this.players = {};
        this.dealerHand = [];
        this.state = 'WAITING';
        this.timer = 0;
        this.forcedResult = null;
    }

    startBetting() {
        this.state = 'BETTING';
        this.timer = 20;
    }

    generateDeck() {
        const suits = ['♠', '♥', '♦', '♣'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const deck = [];
        for (let suit of suits) {
            for (let rank of ranks) {
                deck.push({ suit, rank });
            }
        }
        return deck.sort(() => Math.random() - 0.5);
    }

    deal() {
        this.state = 'DEALING';
        const deck = this.generateDeck();
        let cursor = 0;

        // Deal to active players
        for (let userId in this.players) {
            this.players[userId].hand = deck.slice(cursor, cursor + 3);
            cursor += 3;
        }

        // Deal to dealer
        this.dealerHand = deck.slice(cursor, cursor + 3);

        this.resolve();
    }

    async resolve() {
        this.state = 'RESOLVING';
        this.timer = 8;

        const dealerEval = evaluateHand(this.dealerHand);

        for (let userId in this.players) {
            const player = this.players[userId];
            const playerEval = evaluateHand(player.hand);

            let result, winAmount;
            if (playerEval.score > dealerEval.score) {
                result = 'WIN';
                winAmount = Math.floor(player.betAmount * 1.9);
            } else if (playerEval.score < dealerEval.score) {
                result = 'LOSE';
                winAmount = 0;
            } else {
                result = 'TIE';
                winAmount = player.betAmount;
            }

            player.result = result;
            player.winAmount = winAmount;

            try {
                // Update Database
                if (winAmount > 0) {
                    await User.findByIdAndUpdate(userId, { $inc: { coins: winAmount } });
                }

                const netProfit = winAmount - player.betAmount;
                const txn = new Transaction({
                    user_id: userId,
                    amount: netProfit,
                    type: "game_teenpatti",
                    details: `Table ${this.id} Result: ${result}, Hand: ${playerEval.rank}`
                });
                await txn.save();

                // Update Admin Wallet
                if (netProfit !== 0) {
                    await Admin.findOneAndUpdate({}, { $inc: { balance: -netProfit } });
                }
            } catch (error) {
                console.error(`Error resolving TeenPatti for user ${userId}:`, error);
            }
        }
    }
}

const tables = {
    1: new TeenPattiTable(1),
    2: new TeenPattiTable(2),
    3: new TeenPattiTable(3)
};

setInterval(() => {
    for (let id in tables) {
        const table = tables[id];
        if (table.timer > 0) {
            table.timer--;
        } else {
            if (table.state === 'WAITING' || table.state === 'RESOLVING') {
                table.reset();
                table.startBetting();
            } else if (table.state === 'BETTING') {
                if (Object.keys(table.players).length > 0) {
                    table.deal();
                } else {
                    table.timer = 5; // Wait for players
                }
            }
        }
    }
}, 1000);

module.exports = {
    getTables: () => {
        return Object.values(tables).map(t => ({
            id: t.id,
            state: t.state,
            timer: t.timer,
            playerCount: Object.keys(t.players).length,
            players: t.players,
            dealerHand: (t.state === 'RESOLVING' || t.state === 'DEALING') ? t.dealerHand : []
        }));
    },
    placeBet: (tableId, userId, name, betAmount) => {
        const table = tables[tableId];
        if (!table) return { success: false, message: "Table not found" };
        if (table.state !== 'BETTING') return { success: false, message: "Betting phase over" };
        if (table.players[userId]) return { success: false, message: "Already placed bet" };
        if (Object.keys(table.players).length >= table.maxPlayers) return { success: false, message: "Table full" };

        table.players[userId] = {
            name,
            betAmount: Number(betAmount),
            hand: [],
            status: 'active'
        };
        return { success: true };
    },
    forceResult: (tableId, result) => {
        if (tables[tableId]) {
            tables[tableId].forcedResult = result;
            return true;
        }
        return false;
    }
};
