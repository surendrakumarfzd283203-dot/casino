const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class LudoManager {
    constructor() {
        this.rooms = {}; // { roomId: { players: {}, gameState: 'WAITING', moves: 0, turn: userId, scores: {} } }
        this.maxMoves = 25;
    }

    joinRoom(roomId, userId, name, avatar) {
        const stake = roomId.split('_')[0];
        // Find existing room with 1 real player waiting
        let existingRoomId = Object.keys(this.rooms).find(rid => {
            const r = this.rooms[rid];
            return r.gameState === 'WAITING' &&
                   Object.keys(r.players).length === 1 &&
                   !Object.values(r.players)[0].isBot &&
                   rid.startsWith(stake + '_');
        });

        if (existingRoomId) {
            roomId = existingRoomId;
        } else {
            // Check if user is already in a room
            const currentRoomId = Object.keys(this.rooms).find(rid => this.rooms[rid].players[userId]);
            if (currentRoomId) return { success: true, roomId: currentRoomId };

            if (!this.rooms[roomId]) {
                this.rooms[roomId] = {
                    id: roomId,
                    players: {},
                    gameState: 'WAITING',
                    moves: 0,
                    turn: null,
                    scores: {},
                    timer: 10,
                    history: []
                };
            }
        }

        const room = this.rooms[roomId];
        if (room.gameState !== 'WAITING' && !room.players[userId]) return { success: false, message: "Game already started" };
        if (Object.keys(room.players).length >= 2 && !room.players[userId]) return { success: false, message: "Room full" };

        if (!room.players[userId]) {
            room.players[userId] = { id: userId, name: name || "Player", avatar: avatar || "", isBot: false };
            room.scores[userId] = 0;
        }

        if (Object.keys(room.players).length === 2) {
            if (room.joinInterval) {
                clearInterval(room.joinInterval);
                room.joinInterval = null;
            }
            // Delay slightly for UI transition
            setTimeout(() => {
                if (this.rooms[roomId]) this.startGame(roomId);
            }, 1500);
        } else {
            this.startJoinTimer(roomId);
        }

        return { success: true, roomId };
    }

    startJoinTimer(roomId) {
        const room = this.rooms[roomId];
        if (room.joinInterval) return;
        room.timer = 1; // Direct bot join if no player found in 1 second
        room.joinInterval = setInterval(() => {
            if (!this.rooms[roomId] || room.gameState !== 'WAITING') {
                clearInterval(room.joinInterval);
                return;
            }
            if (room.timer > 0) {
                room.timer--;
            } else {
                clearInterval(room.joinInterval);
                if (Object.keys(room.players).length === 1) {
                    this.addBot(roomId);
                }
            }
        }, 1000);
    }

    addBot(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        const botId = "bot_" + Math.floor(Math.random() * 9000 + 1000);
        room.players[botId] = { id: botId, name: "Admin Bot", avatar: "🤖", isBot: true };
        room.scores[botId] = 0;
        this.startGame(roomId);
    }

    startGame(roomId) {
        const room = this.rooms[roomId];
        room.gameState = 'PLAYING';
        room.moves = 0;
        room.turn = Object.keys(room.players)[0];
        room.timer = 15; // Time per move
        this.startMoveTimer(roomId);
    }

    startMoveTimer(roomId) {
        const room = this.rooms[roomId];
        if (room.moveInterval) clearInterval(room.moveInterval);

        room.moveInterval = setInterval(() => {
            if (!this.rooms[roomId] || room.gameState !== 'PLAYING') {
                clearInterval(room.moveInterval);
                return;
            }

            if (room.timer > 0) {
                room.timer--;
                // If it's bot's turn, make move after 2 seconds
                const currentPlayer = room.players[room.turn];
                if (currentPlayer.isBot && room.timer === 13) {
                    this.makeMove(room.turn, roomId);
                }
            } else {
                // Time out - auto move
                this.makeMove(room.turn, roomId);
            }
        }, 1000);
    }

    async makeMove(userId, roomId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING' || room.turn !== userId) return;

        let dice = Math.floor(Math.random() * 6) + 1;
        const player = room.players[userId];
        const playerIds = Object.keys(room.players);

        // Rigged logic for bot: Bot MUST win against 1 human
        let finalDice = dice;
        const players = Object.values(room.players);
        const humans = players.filter(p => !p.isBot);
        const bot = players.find(p => p.isBot);

        if (player.isBot && humans.length === 1) {
            // Bot gets 5 or 6 almost every time (95%)
            if (Math.random() < 0.95) {
                finalDice = Math.floor(Math.random() * 2) + 5;
            }
        } else if (!player.isBot && bot) {
            // Human gets 1 or 2 most of the time (80%) when playing against bot
            if (Math.random() < 0.8) {
                finalDice = Math.floor(Math.random() * 2) + 1;
            }
        }

        room.scores[userId] += finalDice;
        room.history.push({ userId, name: player.name, dice: finalDice, time: Date.now() });

        room.moves++;
        room.timer = 15; // Reset turn timer

        // Rotate turn
        const currentPlayerIndex = playerIds.indexOf(userId);
        const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
        room.turn = playerIds[nextPlayerIndex];

        // Total rounds check: 25 rounds each = 50 total moves
        if (room.moves >= this.maxMoves * playerIds.length) {
            this.finishGame(roomId);
        }
    }

    async finishGame(roomId) {
        const room = this.rooms[roomId];
        room.gameState = 'FINISHED';
        clearInterval(room.moveInterval);

        const playerIds = Object.keys(room.players);
        let winnerId = playerIds[0];
        if (room.scores[playerIds[1]] > room.scores[playerIds[0]]) {
            winnerId = playerIds[1];
        } else if (room.scores[playerIds[1]] === room.scores[playerIds[0]]) {
            // Tie breaker or split? Let's say first player wins in tie
            winnerId = playerIds[0];
        }

        room.winner = winnerId;

        // Process winnings if it's a real player
        const winner = room.players[winnerId];
        if (!winner.isBot) {
            // How much they win? Need to know the entry fee
            const entryFee = Number(roomId.split('_')[0]) || 10;
            const winAmount = entryFee * 1.8; // 10% commission
            await User.findByIdAndUpdate(winnerId, { $inc: { coins: winAmount } });
            await new Transaction({
                user_id: winnerId,
                amount: winAmount,
                type: 'game_win',
                game_name: 'Ludo',
                details: 'Won Ludo Match'
            }).save();
            await Admin.findOneAndUpdate({}, { $inc: { balance: -(winAmount - entryFee) } });
        } else {
            // Bot won, money goes to admin
            const entryFee = Number(roomId.split('_')[0]) || 10;
            await Admin.findOneAndUpdate({}, { $inc: { balance: entryFee } });
        }

        // Keep room for 10 seconds then clear
        setTimeout(() => {
            delete this.rooms[roomId];
        }, 10000);
    }

    getRoomState(roomId, userId) {
        const room = this.rooms[roomId];
        if (!room) return null;
        return {
            ...room,
            myId: userId
        };
    }
}

module.exports = new LudoManager();
