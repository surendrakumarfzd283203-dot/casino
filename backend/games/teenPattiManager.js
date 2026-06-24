const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { evaluateHand } = require("./teenpatti");
const { checkReferralReward } = require("../utils/referral");

class TeenPattiTable {
    constructor(id, bootAmount = 10, isPrivate = false, password = null) {
        this.id = id;
        this.players = {}; // { userId: { name, hand, status, blind, isBot, lastAction } }
        this.state = 'WAITING'; // WAITING, DEALING, PLAYING, SHOW
        this.timer = 10;
        this.currentTurn = null;
        this.pot = 0;
        this.lastBet = bootAmount;
        this.bootAmount = bootAmount;
        this.isPrivate = isPrivate;
        this.password = password;
        this.sideShowTarget = null; // Who is being asked for a side show
        this.sideShowRequester = null;
        this.history = [];
        this.roundId = Date.now();
    }

    reset() {
        // Keep players but reset game state
        for (let uid in this.players) {
            this.players[uid].hand = [];
            this.players[uid].status = 'WAITING';
            this.players[uid].blind = true;
            this.players[uid].lastAction = null;
        }
        this.pot = 0;
        this.lastBet = this.bootAmount;
        this.state = 'WAITING';
        this.timer = 10;
        this.currentTurn = null;
        this.sideShowTarget = null;
        this.sideShowRequester = null;
        this.roundId = Date.now();
    }

    async start() {
        const playerIds = Object.keys(this.players);
        if (playerIds.length < 2) {
            // Add a bot if alone for too long
            if (playerIds.length === 1 && Math.random() > 0.5) {
                const botNames = ["Ananya", "Rohan_Pro", "Sneha_tp", "Vikram", "Priya_King"];
                const name = botNames[Math.floor(Math.random() * botNames.length)];
                this.players["bot_" + name] = { name, hand: [], status: 'WAITING', blind: true, isBot: true };
            } else {
                this.timer = 10;
                return;
            }
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
                await new Transaction({ user_id: uid, amount: -this.bootAmount, type: 'game_loss', details: `Teen Patti Boot T#${this.id}` }).save();
            } else {
                this.pot += this.bootAmount;
            }
            this.players[uid].status = 'ACTIVE';
        }

        if (Object.keys(this.players).length < 2) {
            this.reset();
            return;
        }

        this.state = 'DEALING';
        this.timer = 4;
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

        this.state = 'PLAYING';
        this.currentTurn = activeUids[0];
        this.timer = 25;
    }

    async handleMove(userId, move, amount, targetId = null) {
        if (this.state !== 'PLAYING') return { success: false, message: "Game not in playing state" };
        if (this.currentTurn !== userId) return { success: false, message: "Not your turn" };

        const player = this.players[userId];
        if (!player || player.status !== 'ACTIVE') return { success: false, message: "Invalid player" };

        if (move === 'PACK') {
            player.status = 'PACKED';
            player.lastAction = "PACKED";
        } else if (move === 'SEE') {
            player.blind = false;
            player.lastAction = "SEEN";
            return { success: true };
        } else if (move === 'CHAAL' || move === 'BLIND') {
            const bet = player.blind ? this.lastBet : this.lastBet * 2;
            if (!player.isBot) {
                const user = await User.findById(userId);
                if (!user || user.coins < bet) return { success: false, message: "Insufficient coins" };
                user.coins -= bet;
                user.referral_played = true;
                await user.save();
                this.pot += bet;
                await new Transaction({ user_id: userId, amount: -bet, type: 'game_loss', details: `Teen Patti Bet T#${this.id}` }).save();
            } else {
                this.pot += bet;
            }
            this.lastBet = player.blind ? this.lastBet : this.lastBet; // Last bet logic varies, keeping it simple
            player.lastAction = player.blind ? "BLIND" : "CHAAL";
        } else if (move === 'SIDESHOW') {
            // Can only sideshow if both have seen
            if (player.blind) return { success: false, message: "You must see your cards first" };

            const activePlayers = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
            const prevPlayerIdx = (activePlayers.indexOf(userId) - 1 + activePlayers.length) % activePlayers.length;
            const prevPlayerId = activePlayers[prevPlayerIdx];

            if (this.players[prevPlayerId].blind) return { success: false, message: "Previous player is still blind" };

            this.sideShowRequester = userId;
            this.sideShowTarget = prevPlayerId;

            // If bot is target, it usually accepts
            if (this.players[prevPlayerId].isBot) {
                setTimeout(() => this.resolveSideShow(true), 2000);
            }
            return { success: true, sideShowActive: true };
        }

        this.nextTurn();
        return { success: true };
    }

    async resolveSideShow(accepted) {
        if (!this.sideShowRequester || !this.sideShowTarget) return;

        if (accepted) {
            const p1Score = evaluateHand(this.players[this.sideShowRequester].hand).score;
            const p2Score = evaluateHand(this.players[this.sideShowTarget].hand).score;

            if (p1Score > p2Score) {
                this.players[this.sideShowTarget].status = 'PACKED';
                this.players[this.sideShowTarget].lastAction = "LOST SIDESHOW";
            } else {
                this.players[this.sideShowRequester].status = 'PACKED';
                this.players[this.sideShowRequester].lastAction = "LOST SIDESHOW";
            }
        } else {
            // Denied
            this.players[this.sideShowRequester].lastAction = "SIDESHOW DENIED";
        }

        this.sideShowRequester = null;
        this.sideShowTarget = null;
        this.nextTurn();
    }

    nextTurn() {
        const activeUids = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
        if (activeUids.length < 2) {
            this.resolve();
            return;
        }

        const currentIdx = activeUids.indexOf(this.currentTurn);
        this.currentTurn = activeUids[(currentIdx + 1) % activeUids.length];
        this.timer = 25;

        // Bot Logic
        if (this.players[this.currentTurn].isBot) {
            setTimeout(() => {
                const bot = this.players[this.currentTurn];
                if (bot.blind && Math.random() > 0.7) bot.blind = false;

                // Randomly decide move
                const rand = Math.random();
                if (rand < 0.1) this.handleMove(this.currentTurn, 'PACK', 0);
                else this.handleMove(this.currentTurn, 'CHAAL', this.lastBet);
            }, 3000);
        }
    }

    async resolve() {
        this.state = 'SHOW';
        this.timer = 10;
        const activePlayers = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');

        if (activePlayers.length === 0) { this.reset(); return; }

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
            await User.findByIdAndUpdate(winnerId, { $inc: { coins: winAmt }, referral_played: true });
            await checkReferralReward(winnerId);
            await new Transaction({ user_id: winnerId, amount: winAmt, type: 'game_win', details: `Won Teen Patti Pot T#${this.id}` }).save();
        } else {
            await Admin.findOneAndUpdate({}, { $inc: { balance: winAmt } });
        }

        for (let uid in this.players) {
            this.players[uid].result = (uid === winnerId) ? 'WIN' : 'LOSE';
            this.players[uid].winAmount = (uid === winnerId) ? winAmt : 0;
        }

        this.history.unshift({ winner: this.players[winnerId].name, pot: this.pot, time: new Date() });
        if (this.history.length > 10) this.history.pop();
    }
}

const tableConfigs = [
    { id: 1, boot: 5 },
    { id: 2, boot: 10 },
    { id: 3, boot: 50 },
    { id: 4, boot: 100 },
    { id: 5, boot: 500, private: true }
];

const tables = {};
tableConfigs.forEach(cfg => {
    tables[cfg.id] = new TeenPattiTable(cfg.id, cfg.boot, cfg.private);
});

setInterval(async () => {
    for (let id in tables) {
        const t = tables[id];
        if (t.timer > 0) {
            t.timer--;
        } else {
            if (t.state === 'WAITING') await t.start();
            else if (t.state === 'DEALING') t.deal();
            else if (t.state === 'SHOW') t.reset();
            else if (t.state === 'PLAYING') {
                // Auto pack if timer runs out
                if (t.sideShowTarget) {
                    await t.resolveSideShow(true); // Auto accept
                } else {
                    await t.handleMove(t.currentTurn, 'PACK', 0);
                }
            }
        }
    }
}, 1000);

module.exports = {
    getTables: (requestingUserId) => Object.values(tables).map(t => {
        const filteredPlayers = {};
        for (let uid in t.players) {
            const p = t.players[uid];
            const showHand = (uid === requestingUserId) || (t.state === 'SHOW');
            // Consistent card objects even when hidden to avoid "undefined" in frontend
            filteredPlayers[uid] = {
                ...p,
                hand: showHand ? p.hand : [{rank:'?', suit:'?'}, {rank:'?', suit:'?'}, {rank:'?', suit:'?'}]
            };
        }
        return {
            id: t.id, state: t.state, timer: t.timer, pot: t.pot,
            currentTurn: t.currentTurn, lastBet: t.lastBet, boot: t.bootAmount,
            players: filteredPlayers, history: t.history, isPrivate: t.isPrivate,
            sideShowRequester: t.sideShowRequester, sideShowTarget: t.sideShowTarget
        };
    }),
    joinTable: (tableId, userId, name, password = null) => {
        const t = tables[tableId];
        if (!t) return { success: false, message: "Table not found" };
        if (t.isPrivate && t.password && t.password !== password) return { success: false, message: "Wrong password" };
        if (Object.keys(t.players).length >= 5) return { success: false, message: "Table full" };

        // Remove from other tables
        for(let id in tables) delete tables[id].players[userId];

        t.players[userId] = { name, hand: [], status: 'WAITING', blind: true, isBot: false, lastAction: null };
        return { success: true };
    },
    makeMove: (userId, move, amount, tableId, targetId) => tables[tableId].handleMove(userId, move, amount, targetId),
    respondSideShow: (tableId, userId, accepted) => {
        const t = tables[tableId];
        if (t && t.sideShowTarget === userId) {
            t.resolveSideShow(accepted);
            return { success: true };
        }
        return { success: false };
    }
};
