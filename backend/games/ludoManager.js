const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class LudoManager {
    constructor() {
        this.rooms = {};
        this.io = null;

        this.SAFE_POSITIONS = [1, 9, 14, 22, 27, 35, 40, 48];
        this.START_POSITIONS = { 0: 1, 1: 27 };
        this.HOME_PATH_START = { 0: 51, 1: 25 };
        this.TOTAL_CELLS = 52;
        this.GAME_DURATION = 300; // 5 minutes in seconds

        this.BOT_NAMES = ["Hero5004", "Nawab385", "CasinoKing", "ProPlayer", "LuckyStar", "MasterMind"];
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
                if (room.gameTimer <= 0) {
                    this.endGameByScore(roomId);
                }
            } else if (room.gameState === 'WAITING') {
                room.waitingTime++;
                if (room.waitingTime >= 10) { // Join bot after 10 seconds
                    this.addBot(roomId);
                }
            }
        }
    }

    addBot(roomId) {
        const room = this.rooms[roomId];
        if (!room || room.players.length >= 2) return;

        const botName = this.BOT_NAMES[Math.floor(Math.random() * this.BOT_NAMES.length)];
        const botAvatar = this.BOT_AVATARS[Math.floor(Math.random() * this.BOT_AVATARS.length)];
        const botId = "bot_" + Math.random().toString(36).substr(2, 9);

        room.players.push({
            id: botId,
            name: botName,
            avatar: botAvatar,
            socketId: null,
            isBot: true,
            color: 'blue',
            score: 0,
            misses: 0
        });

        room.gameState = 'PLAYING';
        room.turn = Math.floor(Math.random() * 2);
        this.startGame(roomId);
    }

    async joinRoom(socket, userId, amount) {
        const stake = Number(amount);
        const name = socket.user.name;
        const avatar = socket.user.avatar;

        let roomId = Object.keys(this.rooms).find(id =>
            this.rooms[id].gameState === 'WAITING' &&
            this.rooms[id].stake === stake &&
            this.rooms[id].players.length === 1
        );

        if (!roomId) {
            roomId = `ludo_${Date.now()}_${userId}`;
            this.rooms[roomId] = {
                id: roomId,
                stake: stake,
                players: [{
                    id: userId,
                    name,
                    avatar,
                    socketId: socket.id,
                    isBot: false,
                    color: 'red',
                    score: 0,
                    misses: 0
                }],
                gameState: 'WAITING',
                waitingTime: 0,
                boardState: {
                    tokens: {
                        0: [-1, -1, -1, -1],
                        1: [-1, -1, -1, -1]
                    }
                },
                turn: 0,
                dice: 1,
                rolled: false,
                gameTimer: this.GAME_DURATION,
                lastUpdate: Date.now()
            };
        } else {
            const room = this.rooms[roomId];
            if (room.players[0].id === userId) return;

            room.players.push({
                id: userId,
                name,
                avatar,
                socketId: socket.id,
                isBot: false,
                color: 'blue',
                score: 0,
                misses: 0
            });
            room.gameState = 'PLAYING';
            room.turn = Math.floor(Math.random() * 2);
            this.startGame(roomId);
        }

        socket.join(roomId);
        this.emitState(roomId);
    }

    startGame(roomId) {
        const room = this.rooms[roomId];
        this.io.to(roomId).emit('game_started', {
            players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color })),
            turn: room.turn,
            gameTimer: room.gameTimer
        });
        this.startTurnTimer(roomId);
    }

    startTurnTimer(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        if (room.timer) clearTimeout(room.timer);

        room.turnDeadline = Date.now() + 15000;
        room.timer = setTimeout(() => {
            this.handleTimeout(roomId);
        }, 15500);

        this.checkBotAction(roomId);
    }

    checkBotAction(roomId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING') return;

        const currentPlayer = room.players[room.turn];
        if (currentPlayer.isBot) {
            setTimeout(() => {
                if (!room.rolled) {
                    this.rollDice(currentPlayer.id, roomId);
                    setTimeout(() => {
                        const possible = this.getPossibleMoves(roomId);
                        if (possible.length > 0) {
                            // Simple bot logic: choose move that kills, or farthest move
                            let bestToken = possible[0];
                            // To make bot somewhat smart:
                            this.moveToken(currentPlayer.id, roomId, bestToken);
                        }
                    }, 1000);
                }
            }, 1500 + Math.random() * 2000);
        }
    }

    handleTimeout(roomId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING') return;

        const player = room.players[room.turn];
        player.misses++;

        this.io.to(roomId).emit('turn_missed', { userId: player.id, misses: player.misses });

        if (player.misses >= 3) {
            this.endGameByMiss(roomId, player.id);
        } else {
            this.nextTurn(roomId);
        }
    }

    rollDice(userId, roomId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING' || room.rolled) return;
        if (room.players[room.turn].id !== userId) return;

        const dice = Math.floor(Math.random() * 6) + 1;
        room.dice = dice;
        room.rolled = true;

        this.io.to(roomId).emit('dice_rolled', { dice, turn: room.turn });

        const possibleMoves = this.getPossibleMoves(roomId);
        if (possibleMoves.length === 0) {
            setTimeout(() => this.nextTurn(roomId), 1500);
        }
    }

    getPossibleMoves(roomId) {
        const room = this.rooms[roomId];
        const dice = room.dice;
        const playerIndex = room.turn;
        const tokens = room.boardState.tokens[playerIndex];
        const possible = [];

        tokens.forEach((pos, i) => {
            if (pos === -1) {
                if (dice === 6) possible.push(i);
            } else if (pos >= 101) {
                if (pos + dice <= 106) possible.push(i);
            } else {
                possible.push(i);
            }
        });
        return possible;
    }

    async moveToken(userId, roomId, tokenIndex) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING' || !room.rolled) return;
        if (room.players[room.turn].id !== userId) return;

        const possible = this.getPossibleMoves(roomId);
        if (!possible.includes(tokenIndex)) return;

        const dice = room.dice;
        const playerIndex = room.turn;
        let currentPos = room.boardState.tokens[playerIndex][tokenIndex];
        let nextPos;
        let pointsEarned = 0;

        if (currentPos === -1) {
            nextPos = this.START_POSITIONS[playerIndex];
            pointsEarned = 1;
        } else if (currentPos >= 101) {
            nextPos = currentPos + dice;
            pointsEarned = dice;
            if (nextPos === 106) pointsEarned += 56; // Bonus for reaching home
        } else {
            let tempPos = currentPos;
            let enteredHome = false;
            for (let s = 0; s < dice; s++) {
                if (tempPos === this.HOME_PATH_START[playerIndex]) {
                    nextPos = 101 + (dice - s - 1);
                    enteredHome = true;
                    pointsEarned = dice;
                    break;
                }
                tempPos = (tempPos % this.TOTAL_CELLS) + 1;
            }
            if (!enteredHome) {
                nextPos = tempPos;
                pointsEarned = dice;
            }
        }

        room.boardState.tokens[playerIndex][tokenIndex] = nextPos;
        room.players[playerIndex].score += pointsEarned;

        let killed = false;
        if (nextPos <= 52 && !this.SAFE_POSITIONS.includes(nextPos)) {
            const opponentIndex = 1 - playerIndex;
            const oppTokens = room.boardState.tokens[opponentIndex];
            oppTokens.forEach((opos, oi) => {
                if (opos === nextPos) {
                    // Calculate points lost by opponent
                    // Simplified: for now just reset their token
                    room.boardState.tokens[opponentIndex][oi] = -1;
                    killed = true;
                    room.players[playerIndex].score += 10; // Bonus for kill
                }
            });
        }

        this.io.to(roomId).emit('token_moved', {
            playerIndex,
            tokenIndex,
            nextPos,
            tokens: room.boardState.tokens,
            scores: [room.players[0].score, room.players[1].score],
            killed
        });

        if (room.boardState.tokens[playerIndex].every(p => p === 106)) {
            this.endGame(roomId, userId);
            return;
        }

        if (dice === 6 || killed) {
            room.rolled = false;
            this.startTurnTimer(roomId);
            this.emitState(roomId);
        } else {
            this.nextTurn(roomId);
        }
    }

    nextTurn(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        room.turn = 1 - room.turn;
        room.rolled = false;
        this.startTurnTimer(roomId);
        this.emitState(roomId);
    }

    async endGameByScore(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        const p1 = room.players[0];
        const p2 = room.players[1];
        let winnerId = p1.score >= p2.score ? p1.id : p2.id;
        this.endGame(roomId, winnerId);
    }

    async endGameByMiss(roomId, loserId) {
        const room = this.rooms[roomId];
        if (!room) return;
        const winner = room.players.find(p => p.id !== loserId);
        this.endGame(roomId, winner.id);
    }

    async endGame(roomId, winnerId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState === 'FINISHED') return;
        room.gameState = 'FINISHED';
        room.winner = winnerId;
        if (room.timer) clearTimeout(room.timer);

        const stake = room.stake;
        const prize = stake * 1.8;

        const winner = room.players.find(p => p.id === winnerId);
        if (winner && !winner.isBot) {
            try {
                await User.findByIdAndUpdate(winnerId, { $inc: { coins: prize } });
                await new Transaction({
                    user_id: winnerId,
                    amount: prize,
                    type: 'game_win',
                    game_name: 'Ludo',
                    details: `Won Ludo match (Stake: ${stake})`
                }).save();
                await Admin.findOneAndUpdate({}, { $inc: { balance: -(prize - stake) } });
            } catch (e) { console.error("Ludo Win error:", e); }
        }

        this.io.to(roomId).emit('game_over', { winnerId, prize, scores: [room.players[0].score, room.players[1].score] });
        setTimeout(() => delete this.rooms[roomId], 5000);
    }

    emitState(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        this.io.to(roomId).emit('ludo_state', {
            players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, score: p.score, misses: p.misses })),
            gameState: room.gameState,
            board: room.boardState,
            turn: room.turn,
            dice: room.dice,
            rolled: room.rolled,
            turnDeadline: room.turnDeadline,
            gameTimer: room.gameTimer
        });
    }

    handleDisconnect(socketId) {
        const roomId = Object.keys(this.rooms).find(id =>
            this.rooms[id].players.some(p => p.socketId === socketId)
        );
        if (roomId) {
            const room = this.rooms[roomId];
            if (room.gameState === 'PLAYING') {
                const player = room.players.find(p => p.socketId === socketId);
                const opponent = room.players.find(p => p.socketId !== socketId);
                if (opponent) {
                    this.endGame(roomId, opponent.id);
                } else {
                    delete this.rooms[roomId];
                }
            } else {
                delete this.rooms[roomId];
            }
        }
    }
}

module.exports = new LudoManager();
