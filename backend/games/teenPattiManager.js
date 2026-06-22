const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { evaluateHand } = require("./teenpatti");

class TeenPattiTable {
    constructor(id) {
        this.id = id;
        this.players = {}; // { userId: { name, betAmount, hand, status, blind } }
        this.state = 'WAITING'; // WAITING, DEALING, PLAYING, SHOW
        this.timer = 15;
        this.currentTurn = null; // userId
        this.pot = 0;
        this.lastBet = 10;
        this.history = [];
    }

    reset() {
        this.players = {};
        this.pot = 0;
        this.lastBet = 10;
        this.state = 'WAITING';
        this.timer = 15;
    }

    start() {
        if (Object.keys(this.players).length < 2) {
            this.timer = 10;
            return;
        }
        this.state = 'DEALING';
        this.timer = 5;
        this.deal();
    }

    deal() {
        const suits = ['♠', '♥', '♦', '♣'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = [];
        for (let s of suits) for (let r of ranks) deck.push({ suit: s, rank: r });
        deck.sort(() => Math.random() - 0.5);

        for (let uid in this.players) {
            this.players[uid].hand = deck.splice(0, 3);
            this.players[uid].status = 'ACTIVE';
            this.players[uid].blind = true;
        }
        this.state = 'PLAYING';
        this.currentTurn = Object.keys(this.players)[0];
        this.timer = 20;
    }

    async handleMove(userId, move, amount, tableId) {
        if (this.currentTurn !== userId) return { success: false, message: "Not your turn" };
        const player = this.players[userId];

        if (move === 'PACK') {
            player.status = 'PACKED';
        } else if (move === 'CHAAL') {
            const bet = player.blind ? amount : amount * 2;
            const user = await User.findById(userId);
            if (user.coins < bet) return { success: false, message: "Insufficient coins" };

            user.coins -= bet;
            await user.save();
            this.pot += bet;
            this.lastBet = amount;
        } else if (move === 'SEE') {
            player.blind = false;
            return { success: true };
        }

        // Next Turn
        const uids = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
        if (uids.length < 2) {
            this.resolve();
        } else {
            const idx = uids.indexOf(userId);
            this.currentTurn = uids[(idx + 1) % uids.length];
            this.timer = 20;
        }
        return { success: true };
    }

    async resolve() {
        this.state = 'SHOW';
        this.timer = 10;
        const activePlayers = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');

        let winnerId = activePlayers[0];
        let bestScore = -1;

        for (let uid of activePlayers) {
            const score = evaluateHand(this.players[uid].hand).score;
            if (score > bestScore) {
                bestScore = score;
                winnerId = uid;
            }
        }

        const winAmt = Math.floor(this.pot * 0.95);
        await User.findByIdAndUpdate(winnerId, { $inc: { coins: winAmt } });

        for (let uid in this.players) {
            this.players[uid].result = (uid === winnerId) ? 'WIN' : 'LOSE';
            this.players[uid].winAmount = (uid === winnerId) ? winAmt : 0;
        }

        this.history.unshift({ winner: this.players[winnerId].name, pot: this.pot });
        if (this.history.length > 10) this.history.pop();
    }
}

const tables = { 1: new TeenPattiTable(1) };

setInterval(async () => {
    for (let id in tables) {
        const t = tables[id];
        if (t.timer > 0) t.timer--;
        else {
            if (t.state === 'WAITING') t.start();
            else if (t.state === 'SHOW') t.reset();
            else if (t.state === 'PLAYING') {
                await t.handleMove(t.currentTurn, 'PACK', 0, t.id);
            }
        }
    }
}, 1000);

module.exports = {
    getTables: () => Object.values(tables).map(t => ({
        id: t.id, state: t.state, timer: t.timer, pot: t.pot,
        currentTurn: t.currentTurn, lastBet: t.lastBet,
        players: t.players, history: t.history
    })),
    joinTable: (tableId, userId, name) => {
        const t = tables[tableId];
        if (t.state !== 'WAITING') return { success: false, message: "Game in progress" };
        if (t.players[userId]) return { success: true };
        if (Object.keys(t.players).length >= 5) return { success: false, message: "Table full" };
        t.players[userId] = { name, betAmount: 0, hand: [], status: 'WAITING', blind: true };
        return { success: true };
    },
    makeMove: (userId, move, amount, tableId) => tables[tableId].handleMove(userId, move, amount, tableId)
};
