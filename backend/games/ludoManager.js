const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class LudoManager {
    constructor() {
        this.rooms = {};
        this.io = null;

        this.SAFE_POSITIONS = [1, 9, 14, 22, 27, 35, 40, 48];
        this.START_POSITIONS = { 0: 1, 1: 14, 2: 27, 3: 40 };
        this.HOME_PATH_START = { 0: 51, 1: 12, 2: 25, 3: 38 };
        this.TOTAL_CELLS = 52;
        this.GAME_DURATION = 300;

        this.BOT_NAMES = ["ProPlayer", "CasinoKing", "LuckyStar", "MasterMind", "Nawab385", "Hero5004"];
        this.BOT_AVATARS = [
            "https://i.pravatar.cc/150?u=bot1",
            "https://i.pravatar.cc/150?u=bot2",
            "https://i.pravatar.cc/150?u=bot3",
            "https://i.pravatar.cc/150?u=bot4",
            "https://i.pravatar.cc/150?u=bot5"
        ];
    }

    init(io) {
        this.io = io;
        setInterval(() => this.updateTimers(), 1000);
    }

    updateTimers() {
        for (let roomId in this.rooms) {
            const room = this.rooms[roomId];
            if (room.gameState === 'PLAYING') {
                room.gameTimer--;
                this.io.to(roomId).emit('ludo_timer', {
                    gameTimer: room.gameTimer,
                    turnDeadline: room.turnDeadline ? Math.max(0, Math.floor((room.turnDeadline - Date.now()) / 1000)) : 0
                });
                if (room.gameTimer <= 0) this.endGameByScore(roomId);
            } else if (room.gameState === 'WAITING') {
                room.waitingTime++;
                if (room.waitingTime >= 5) { // Faster bot join (5 seconds)
                    this.addBot(roomId);
                }
            }
        }
    }

    addBot(roomId) {
        const room = this.rooms[roomId];
        if (!room || room.players.length >= 2 || room.gameState === 'PLAYING') return;

        console.log(`Adding bot to room: ${roomId}`);
        const botName = this.BOT_NAMES[Math.floor(Math.random() * this.BOT_NAMES.length)];
        const botAvatar = this.BOT_AVATARS[Math.floor(Math.random() * this.BOT_AVATARS.length)];
        const botId = "bot_" + Math.random().toString(36).substr(2, 9);

        const playerColor = room.players[0].color;
        const botColor = (playerColor + 2) % 4;

        room.players.push({
            id: botId, name: botName, avatar: botAvatar, socketId: null,
            isBot: true, color: botColor, score: 0, misses: 0
        });

        room.boardState.tokens[botColor] = [-1, -1, -1, -1];
        room.gameState = 'PLAYING';
        this.startGame(roomId);
    }

    async joinRoom(socket, userId, amount) {
        console.log(`User ${userId} joining Ludo with stake ${amount}`);
        const stake = Number(amount);
        const name = socket.user.name;
        const avatar = socket.user.avatar;

        let roomId = Object.keys(this.rooms).find(id =>
            this.rooms[id].gameState === 'WAITING' &&
            this.rooms[id].stake === stake &&
            this.rooms[id].players.length === 1 &&
            !this.rooms[id].players[0].isBot
        );

        if (!roomId) {
            roomId = `ludo_${Date.now()}_${userId}`;
            const color = Math.floor(Math.random() * 4);
            this.rooms[roomId] = {
                id: roomId, stake: stake,
                players: [{
                    id: userId.toString(), name, avatar, socketId: socket.id,
                    isBot: false, color: color, score: 0, misses: 0
                }],
                gameState: 'WAITING', waitingTime: 0,
                boardState: { tokens: { [color]: [-1, -1, -1, -1] } },
                turn: 0, dice: 1, rolled: false, gameTimer: this.GAME_DURATION, lastUpdate: Date.now()
            };
            console.log(`Created new room: ${roomId}`);
        } else {
            const room = this.rooms[roomId];
            if (room.players[0].id === userId.toString()) return;

            const playerColor = room.players[0].color;
            const myColor = (playerColor + 2) % 4;

            room.players.push({
                id: userId.toString(), name, avatar, socketId: socket.id,
                isBot: false, color: myColor, score: 0, misses: 0
            });
            room.boardState.tokens[myColor] = [-1, -1, -1, -1];
            room.gameState = 'PLAYING';
            room.turn = Math.floor(Math.random() * 2);
            this.startGame(roomId);
            console.log(`User joined existing room: ${roomId}. Game starting.`);
        }
        socket.join(roomId);
        this.emitState(roomId);
    }

    startGame(roomId) {
        const room = this.rooms[roomId];
        console.log(`Game started in room: ${roomId}`);
        this.startTurnTimer(roomId);
        this.emitState(roomId);
    }

    startTurnTimer(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        if (room.timer) clearTimeout(room.timer);
        room.turnDeadline = Date.now() + 15000;
        room.timer = setTimeout(() => this.handleTimeout(roomId), 15500);
        this.checkBotAction(roomId);
    }

    checkBotAction(roomId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING') return;
        const currentPlayer = room.players[room.turn];
        if (currentPlayer.isBot) {
            setTimeout(() => {
                if (!room.rolled && room.gameState === 'PLAYING') {
                    this.rollDice(currentPlayer.id, roomId);
                    setTimeout(() => {
                        if (room.gameState === 'PLAYING') {
                            const possible = this.getPossibleMoves(roomId);
                            if (possible.length > 0) {
                                this.moveToken(currentPlayer.id, roomId, possible[Math.floor(Math.random() * possible.length)]);
                            }
                        }
                    }, 1000);
                }
            }, 1000); // Faster bot roll (1 second)
        }
    }

    handleTimeout(roomId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING') return;
        const player = room.players[room.turn];
        player.misses++;
        this.io.to(roomId).emit('turn_missed', { userId: player.id, misses: player.misses });
        if (player.misses >= 3) this.endGameByMiss(roomId, player.id);
        else this.nextTurn(roomId);
    }

    rollDice(userId, roomId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING' || room.rolled) return;
        if (room.players[room.turn].id !== userId.toString()) return;

        const dice = Math.floor(Math.random() * 6) + 1;
        room.dice = dice;
        room.rolled = true;
        this.io.to(roomId).emit('dice_rolled', { dice, turn: room.turn, playerColor: room.players[room.turn].color });

        const possibleMoves = this.getPossibleMoves(roomId);
        if (possibleMoves.length === 0) setTimeout(() => this.nextTurn(roomId), 1200);
    }

    getPossibleMoves(roomId) {
        const room = this.rooms[roomId];
        const dice = room.dice;
        const playerColor = room.players[room.turn].color;
        const tokens = room.boardState.tokens[playerColor];
        const possible = [];

        tokens.forEach((pos, i) => {
            if (pos === -1) {
                if (dice === 6) possible.push(i);
            } else if (pos >= 101) {
                if (pos + dice <= 106) possible.push(i);
            } else possible.push(i);
        });
        return possible;
    }

    async moveToken(userId, roomId, tokenIndex) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING' || !room.rolled) return;
        const playerIndex = room.turn;
        if (room.players[playerIndex].id !== userId.toString()) return;

        const possible = this.getPossibleMoves(roomId);
        if (!possible.includes(tokenIndex)) return;

        const dice = room.dice;
        const playerColor = room.players[playerIndex].color;
        let currentPos = room.boardState.tokens[playerColor][tokenIndex];
        let path = [];
        let nextPos;
        let pointsEarned = 0;

        if (currentPos === -1) {
            nextPos = this.START_POSITIONS[playerColor];
            path = [nextPos];
            pointsEarned = 1;
        } else {
            let tempPos = currentPos;
            for (let s = 1; s <= dice; s++) {
                if (tempPos >= 101) {
                    tempPos++;
                } else if (tempPos === this.HOME_PATH_START[playerColor]) {
                    tempPos = 101;
                } else {
                    tempPos = (tempPos % this.TOTAL_CELLS) + 1;
                }
                path.push(tempPos);
            }
            nextPos = path[path.length - 1];
            pointsEarned = (nextPos >= 101) ? dice + (nextPos === 106 ? 56 : 0) : dice;
        }

        room.boardState.tokens[playerColor][tokenIndex] = nextPos;
        room.players[playerIndex].score += pointsEarned;

        let killed = false;
        let killData = null;
        if (nextPos <= 52 && !this.SAFE_POSITIONS.includes(nextPos)) {
            for (let pIdx = 0; pIdx < room.players.length; pIdx++) {
                if (pIdx === playerIndex) continue;
                const oppColor = room.players[pIdx].color;
                const oppTokens = room.boardState.tokens[oppColor];
                oppTokens.forEach((opos, oi) => {
                    if (opos === nextPos) {
                        room.boardState.tokens[oppColor][oi] = -1;
                        killed = true;
                        room.players[playerIndex].score += 10;
                        killData = { color: oppColor, index: oi };
                    }
                });
            }
        }

        this.io.to(roomId).emit('token_moved', {
            playerIndex: playerIndex,
            playerColor: playerColor,
            tokenIndex,
            nextPos,
            path,
            tokens: room.boardState.tokens,
            scores: room.players.map(p => p.score),
            killed,
            killData
        });

        if (room.boardState.tokens[playerColor].every(p => p === 106)) {
            this.endGame(roomId, userId);
            return;
        }

        if (dice === 6 || killed) {
            room.rolled = false;
            this.startTurnTimer(roomId);
            this.emitState(roomId);
        } else this.nextTurn(roomId);
    }

    nextTurn(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        room.turn = (room.turn + 1) % room.players.length;
        room.rolled = false;
        this.startTurnTimer(roomId);
        this.emitState(roomId);
    }

    async endGameByScore(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        const scores = room.players.map(p => p.score);
        let winnerIdx = scores[0] >= scores[1] ? 0 : 1;
        this.endGame(roomId, room.players[winnerIdx].id);
    }

    async endGameByMiss(roomId, loserId) {
        const room = this.rooms[roomId];
        if (!room) return;
        const winner = room.players.find(p => p.id !== loserId);
        if (winner) this.endGame(roomId, winner.id);
    }

    async endGame(roomId, winnerId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState === 'FINISHED') return;
        room.gameState = 'FINISHED';
        room.winner = winnerId;
        if (room.timer) clearTimeout(room.timer);

        const stake = room.stake;
        const prize = stake * 1.8;
        const winner = room.players.find(p => p.id === winnerId.toString());
        if (winner && !winner.isBot) {
            try {
                await User.findByIdAndUpdate(winnerId, { $inc: { coins: prize } });
                await new Transaction({
                    user_id: winnerId, amount: prize, type: 'game_win',
                    game_name: 'Ludo', details: `Won Ludo match (Stake: ${stake})`
                }).save();
                await Admin.findOneAndUpdate({}, { $inc: { balance: -(prize - stake) } });
            } catch (e) { console.error("Ludo Win error:", e); }
        }
        this.io.to(roomId).emit('game_over', { winnerId, prize, scores: room.players.map(p => p.score) });
        setTimeout(() => delete this.rooms[roomId], 5000);
    }

    emitState(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        this.io.to(roomId).emit('ludo_state', {
            id: room.id,
            players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, score: p.score, misses: p.misses, isBot: p.isBot })),
            gameState: room.gameState, board: room.boardState,
            turn: room.turn, dice: room.dice, rolled: room.rolled,
            turnDeadline: room.turnDeadline, gameTimer: room.gameTimer
        });
    }

    handleDisconnect(socketId) {
        const roomId = Object.keys(this.rooms).find(id =>
            this.rooms[id].players.some(p => p.socketId === socketId)
        );
        if (roomId) {
            const room = this.rooms[roomId];
            if (room.gameState === 'PLAYING') {
                const opponent = room.players.find(p => p.socketId !== socketId);
                if (opponent) this.endGame(roomId, opponent.id);
            } else delete this.rooms[roomId];
        }
    }

    handleChat(socket, roomId, message, emoji) {
        const room = this.rooms[roomId];
        if (!room) return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender) return;
        this.io.to(roomId).emit('ludo_chat_received', {
            senderId: sender.id,
            name: sender.name,
            message: message,
            emoji: emoji
        });
    }
}

module.exports = new LudoManager();
