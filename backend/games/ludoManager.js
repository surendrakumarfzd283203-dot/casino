const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class LudoManager {
    constructor() {
        this.rooms = {};
        this.io = null;

        this.SAFE_POSITIONS = [1, 9, 14, 22, 27, 35, 40, 48];
        // Positions for 4 colors: 0:Red, 1:Blue, 2:Yellow, 3:Green
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
                if (room.waitingTime >= 6) this.addBot(roomId);
            }
        }
    }

    addBot(roomId) {
        const room = this.rooms[roomId];
        if (!room || room.players.length >= 2) return;

        const botName = this.BOT_NAMES[Math.floor(Math.random() * this.BOT_NAMES.length)];
        const botAvatar = this.BOT_AVATARS[Math.floor(Math.random() * this.BOT_AVATARS.length)];
        const botId = "bot_" + Math.random().toString(36).substr(2, 9);

        // Opposite color selection for 2 players
        // Red(0) vs Yellow(2) or Blue(1) vs Green(3)
        const playerColor = room.players[0].color;
        let botColor = 2; // Default Yellow
        if (playerColor === 1) botColor = 3; // Blue vs Green
        else if (playerColor === 2) botColor = 0; // Yellow vs Red
        else if (playerColor === 3) botColor = 1; // Green vs Blue

        room.players.push({
            id: botId, name: botName, avatar: botAvatar, socketId: null,
            isBot: true, color: botColor, score: 0, misses: 0
        });

        room.boardState.tokens[botColor] = [-1, -1, -1, -1];
        room.gameState = 'PLAYING';
        room.turn = 0; // Human always starts or random?
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
            // Randomly assign player color 0:Red or 1:Blue
            const color = Math.floor(Math.random() * 2);
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
        } else {
            const room = this.rooms[roomId];
            if (room.players[0].id === userId.toString()) return;

            const playerColor = room.players[0].color;
            const myColor = (playerColor === 0) ? 2 : 3; // Red->Yellow, Blue->Green

            room.players.push({
                id: userId.toString(), name, avatar, socketId: socket.id,
                isBot: false, color: myColor, score: 0, misses: 0
            });
            room.boardState.tokens[myColor] = [-1, -1, -1, -1];
            room.gameState = 'PLAYING';
            room.turn = 0;
            this.startGame(roomId);
        }
        socket.join(roomId);
        this.emitState(roomId);
    }

    startGame(roomId) {
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
                if (!room.rolled) {
                    this.rollDice(currentPlayer.id, roomId);
                    setTimeout(() => {
                        const possible = this.getPossibleMoves(roomId);
                        if (possible.length > 0) {
                            this.moveToken(currentPlayer.id, roomId, possible[Math.floor(Math.random() * possible.length)]);
                        }
                    }, 1000);
                }
            }, 1500);
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
        this.io.to(roomId).emit('dice_rolled', { dice, turn: room.turn });

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
        let nextPos;
        let pointsEarned = 0;

        if (currentPos === -1) {
            nextPos = this.START_POSITIONS[playerColor];
            pointsEarned = 1;
        } else if (currentPos >= 101) {
            nextPos = currentPos + dice;
            pointsEarned = dice;
            if (nextPos === 106) pointsEarned += 56;
        } else {
            let tempPos = currentPos;
            let enteredHome = false;
            for (let s = 0; s < dice; s++) {
                if (tempPos === this.HOME_PATH_START[playerColor]) {
                    nextPos = 101 + (dice - s - 1);
                    enteredHome = true;
                    pointsEarned = dice;
                    break;
                }
                tempPos = (tempPos % this.TOTAL_CELLS) + 1;
            }
            if (!enteredHome) { nextPos = tempPos; pointsEarned = dice; }
        }

        room.boardState.tokens[playerColor][tokenIndex] = nextPos;
        room.players[playerIndex].score += pointsEarned;

        let killed = false;
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
                    }
                });
            }
        }

        this.io.to(roomId).emit('token_moved', {
            playerIndex: playerIndex,
            playerColor: playerColor,
            tokenIndex,
            nextPos,
            tokens: room.boardState.tokens,
            scores: room.players.map(p => p.score),
            killed
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
            players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, score: p.score, misses: p.misses })),
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
}

module.exports = new LudoManager();
