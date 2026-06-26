const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class LudoManager {
    constructor() {
        this.rooms = {}; // { roomId: { players: {}, gameState: 'WAITING', moves: 0, turn: userId, scores: {} } }
        this.maxMoves = 25;
    }

    joinRoom(roomId, userId, name, avatar) {
        // Find existing room with 1 real player waiting
        const stake = roomId.split('_')[0];
        let existingRoomId = Object.keys(this.rooms).find(rid => {
            const r = this.rooms[rid];
            return r.gameState === 'WAITING' &&
                   Object.keys(r.players).length === 1 &&
                   !Object.values(r.players)[0].isBot &&
                   rid.startsWith(stake + '_');
        });

        if (existingRoomId) {
            roomId = existingRoomId;
        } else if (!this.rooms[roomId]) {
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

        const room = this.rooms[roomId];
        if (room.gameState !== 'WAITING') return { success: false, message: "Game already started" };
        if (Object.keys(room.players).length >= 2) return { success: false, message: "Room full" };

        room.players[userId] = { id: userId, name, avatar, isBot: false };
        room.scores[userId] = 0;

        if (Object.keys(room.players).length === 2) {
            if (room.joinTimeout) clearTimeout(room.joinTimeout);
            this.startGame(roomId);
        } else {
            // Start a countdown to add a bot if no one joins
            this.startJoinTimer(roomId);
        }

        return { success: true, roomId };
    }

    startJoinTimer(roomId) {
        const room = this.rooms[roomId];
        room.timer = 10;
        if (room.joinInterval) clearInterval(room.joinInterval);
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
        const botId = "bot_" + Math.random().toString(36).substr(2, 5);
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

        const dice = Math.floor(Math.random() * 6) + 1;
        const player = room.players[userId];

        // Rigged logic for bot: Bot MUST win against 1 human
        let finalDice = dice;
        const humans = Object.values(room.players).filter(p => !p.isBot);

        if (player.isBot && humans.length === 1) {
            // Bot gets high numbers (4, 5, 6) 90% of the time to win
            if (Math.random() < 0.9) {
                finalDice = Math.floor(Math.random() * 3) + 4;
            }
        } else if (!player.isBot && Object.values(room.players).some(p => p.isBot)) {
            // Human gets low numbers (1, 2, 3) 60% of the time if playing against bot
            if (Math.random() < 0.6) {
                finalDice = Math.floor(Math.random() * 3) + 1;
            }
        }

        room.scores[userId] += finalDice;
        room.history.push({ userId, name: player.name, dice: finalDice });

        room.moves++;
        room.timer = 15;

        // Check if game finished (25 total moves or 25 moves per player?)
        // Usually Ludo "chal" means moves. Let's assume 25 rounds (each player plays 25 times)
        const playerIds = Object.keys(room.players);
        const currentPlayerIndex = playerIds.indexOf(userId);
        const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
        room.turn = playerIds[nextPlayerIndex];

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
