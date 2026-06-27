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
        this.timer = 5; // Reduced from 7 to 5 for faster start
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

            // --- SMART BOT FILLING ---
            // If only 1 human player, add 2-3 admin bots to beat them
            const humanIds = playerIds.filter(id => !this.players[id].isBot);
            if (humanIds.length === 1) {
                const botNames = ["Casino_Pro", "Gold_Hunter", "Ace_Player", "Lucky_Hand", "Pro_Dealer"];
                const neededBots = 2 + Math.floor(Math.random() * 2); // 2 or 3 bots
                while (Object.keys(this.players).length < neededBots + 1) {
                    const name = botNames[Math.floor(Math.random() * botNames.length)] + "_" + Math.floor(Math.random() * 99);
                    const botId = "admin_bot_" + Math.random().toString(36).substring(7);
                    this.players[botId] = {
                        name, hand: [], status: 'WAITING', blind: true, isBot: true,
                        isAdminBot: true, // Special tag to identify admin side bots
                        avatar: `https://i.pravatar.cc/100?u=${botId}`
                    };
                }
            } else if (humanIds.length > 1) {
                // If 2 or more humans, remove admin bots so they play against each other
                for (let uid in this.players) {
                    if (this.players[uid].isAdminBot) delete this.players[uid];
                }
            }
            // --- END BOT FILLING ---

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
                this.timer = 5;
                return;
            }

            this.state = 'DEALING';
            this.timer = 2; // Reduced from 3 to 2 for faster dealing
        } catch (e) {
            console.error("Table Start Error:", e);
        } finally {
            this.isStarting = false;
        }
    }

    async deal() {
        const activeUids = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
        const suits = ['♠', '♥', '♦', '♣'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = [];
        for (let s of suits) for (let r of ranks) deck.push({ suit: s, rank: r });
        deck.sort(() => Math.random() - 0.5);

        for (let uid of activeUids) {
            this.players[uid].hand = deck.splice(0, 3);
            this.players[uid].blind = true;
        }

        // --- ADVANCED RIGGING LOGIC ---
        const adminBots = activeUids.filter(id => this.players[id].isAdminBot);
        const humans = activeUids.filter(id => !this.players[id].isBot);

        if (adminBots.length > 0 && humans.length === 1) {
            const hId = humans[0];
            const player = this.players[hId];
            const user = await User.findById(hId);

            if (user && user.coins >= 170) {
                // User has 170+ coins: Admin Bot MUST win, but with varied hands.

                // Shuffle ranks to get varied "losing" hands for the human
                const humanRanks = [...ranks].sort(() => Math.random() - 0.5);
                const humanSuits = [...suits].sort(() => Math.random() - 0.5);

                // Give human a random hand that is NOT a top-tier hand
                player.hand = [
                    { suit: humanSuits[0], rank: humanRanks[0] },
                    { suit: humanSuits[1], rank: humanRanks[1] },
                    { suit: humanSuits[2], rank: humanRanks[Math.floor(Math.random() * 5) + 5] }
                ];

                // Pick a random Admin Bot to be the winner
                const winnerBotId = adminBots[Math.floor(Math.random() * adminBots.length)];

                // Give the winner bot a varied "winning" hand
                const botWinningHands = [
                    () => {
                        const r = ranks[Math.floor(Math.random() * 5) + 8]; // High Pair (J-A)
                        const otherR = ranks[Math.floor(Math.random() * 5)];
                        return [{suit: '♠', rank: r}, {suit: '♥', rank: r}, {suit: '♦', rank: otherR}];
                    },
                    () => {
                        const start = Math.floor(Math.random() * 8); // Sequence
                        return [
                            {suit: '♠', rank: ranks[start]},
                            {suit: '♥', rank: ranks[start+1]},
                            {suit: '♦', rank: ranks[start+2]}
                        ];
                    },
                    () => {
                        const s = suits[Math.floor(Math.random() * 4)]; // Color
                        const selectedRanks = [...ranks].sort(() => Math.random() - 0.5).slice(0, 3);
                        return selectedRanks.map(r => ({ suit: s, rank: r }));
                    },
                    () => {
                        const start = Math.floor(Math.random() * 10); // Pure Sequence
                        const s = suits[Math.floor(Math.random() * 4)];
                        return [
                            {suit: s, rank: ranks[start]},
                            {suit: s, rank: ranks[start+1]},
                            {suit: s, rank: ranks[start+2]}
                        ];
                    }
                ];

                this.players[winnerBotId].hand = botWinningHands[Math.floor(Math.random() * botWinningHands.length)]();

                // Ensure other bots also have varied hands
                adminBots.forEach(bId => {
                    if (bId !== winnerBotId) {
                        this.players[bId].hand = deck.splice(0, 3);
                    }
                });

            } else {
                // User has < 170 coins: Fairer play or mild rigging
                // Let's keep it mostly random for adminBots vs humans when balance is low
            }
        } else if (humans.length > 1) {
            // User vs User: Fair play, better hand wins naturally by random deck dealing above
        }
        // --- END RIGGING ---

        this.state = 'PLAYING';
        this.currentTurn = activeUids[0];
        this.timer = 10;
        this.checkBotTurn();
    }

    checkBotTurn() {
        if (this.state !== 'PLAYING' || !this.currentTurn) return;
        const p = this.players[this.currentTurn];
        if (p && p.isBot) {
            setTimeout(async () => {
                const currentP = this.players[this.currentTurn];
                if (!currentP || currentP !== p) return;

                if (p.blind && Math.random() > 0.4) p.blind = false;
                const activeCount = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE').length;
                let move = 'CHAAL';
                if (Math.random() > 0.95) move = 'PACK';
                else if (activeCount === 2 && Math.random() > 0.7) move = 'SHOW';

                await this.handleMove(this.currentTurn, move, this.lastBet);
            }, 1000 + Math.random() * 2000);
        }
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
            this.timer = 10; // Time for target to respond

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
        this.timer = 10;
        this.checkBotTurn();
    }

    async resolve() {
        this.state = 'SHOW';
        this.timer = 15; // Give more time for the new showdown UI
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

            // Clean up players who have left or need to be kicked next round
            if (this.players[uid].needsKick) delete this.players[uid];
        }
    }

    forceCards(userId, hand) {
        const p = this.players[userId];
        if (p) {
            // Admin can edit BOTS anytime. Humans can only be edited if BLIND or in setup states.
            if (p.isBot || p.blind || this.state === 'WAITING' || this.state === 'DEALING' || this.state === 'STARTING') {
                p.hand = hand;
                return true;
            }
        }
        return false;
    }

    forceWinner(type) {
        // type: 'BOTS' or 'HUMANS'
        const activeUids = Object.keys(this.players).filter(id => this.players[id].status === 'ACTIVE');
        if (type === 'BOTS') {
            const bots = activeUids.filter(id => this.players[id].isBot);
            if (bots.length > 0) {
                this.players[bots[0]].hand = [{suit:'♠', rank:'A'}, {suit:'♥', rank:'A'}, {suit:'♦', rank:'A'}];
            }
        } else {
            const humans = activeUids.filter(id => !this.players[id].isBot);
            if (humans.length > 0) {
                this.players[humans[0]].hand = [{suit:'♠', rank:'A'}, {suit:'♥', rank:'A'}, {suit:'♦', rank:'A'}];
            }
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
                    const currentP = t.players[t.currentTurn];
                    if (t.sideShowTarget) await t.respondSideShow(t.sideShowTarget, true);
                    else {
                        await t.handleMove(t.currentTurn, 'PACK', 0);
                        // If player had a pending exit flag, remove them now that turn is over
                        if (currentP && currentP.pendingExit) delete t.players[t.currentTurn];
                    }
                }
            }
        }
    } catch (e) { console.error("TP Interval Error:", e); }
}, 1000);

module.exports = {
    getTables: (userId, isAdmin = false) => Object.values(tables).map(t => {
        const plys = {};
        for(let uid in t.players) {
            const p = t.players[uid];

            // If user returns, clear their pending exit flag
            if (uid === userId) p.pendingExit = false;

            // Show hand if it's me, OR if the request is from an admin, OR game is in SHOW state
            const show = (uid === userId || isAdmin || t.state === 'SHOW');
            let hRank = null;
            if (!p.blind || t.state === 'SHOW' || isAdmin) {
                try { hRank = evaluateHand(p.hand).rank; } catch(e) {}
            }
            plys[uid] = {
                ...p,
                hand: show ? p.hand : [],
                handRank: hRank,
                isBlind: p.blind // Explicitly send blind status to admin
            };
        }
        return {
            id: t.id, state: t.state, timer: t.timer, pot: t.pot,
            currentTurn: t.currentTurn, lastBet: t.lastBet, boot: t.bootAmount,
            players: plys, maxBet: t.maxBet,
            sideShowRequester: t.sideShowRequester, sideShowTarget: t.sideShowTarget
        };
    }),
    leaveTable: (userId) => {
        for (let id in tables) {
            const t = tables[id];
            const p = t.players[userId];
            if (p) {
                // If it's a human player and it's their turn, don't remove yet
                // Allow them to return before their 15s turn timer ends
                if (t.state === 'PLAYING' && t.currentTurn === userId) {
                    p.pendingExit = true;
                } else {
                    delete t.players[userId];

                    // Bot cleanup if table empty
                    const humans = Object.keys(t.players).filter(uid => !t.players[uid].isBot);
                    if (humans.length === 0) {
                        for (let uid in t.players) {
                            if (t.players[uid].isBot) delete t.players[uid];
                        }
                        t.reset();
                    }
                }
                return { success: true };
            }
        }
        return { success: false };
    },
    joinTable: (tableId, userId, name, avatar) => {
        const t = tables[tableId];
        if (!t) return { success: false, message: "Table not found" };
        if (Object.keys(t.players).length >= 6) return { success: false, message: "Table full" };
        // Remove from any other table first
        for(let id in tables) if (tables[id].players[userId]) delete tables[id].players[userId];
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
    respondSideShow: (userId, accepted, tableId) => tables[tableId].respondSideShow(userId, accepted),
    forceCards: (tableId, userId, hand) => {
        const t = tables[tableId];
        return t ? t.forceCards(userId, hand) : false;
    },
    forcePack: (tableId, userId) => {
        const t = tables[tableId];
        if (t && t.players[userId]) {
            t.players[userId].status = 'PACKED';
            if (t.currentTurn === userId) t.nextTurn();
            return true;
        }
        return false;
    },
    forceResult: (tableId, result) => {
        const t = tables[tableId];
        if (!t) return;
        if (result === 'DEALER_WINS') t.forceWinner('BOTS');
        else if (result === 'PLAYERS_WIN') t.forceWinner('HUMANS');
    }
};
