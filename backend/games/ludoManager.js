const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class LudoManager {
    constructor() {
        this.rooms = {}; // { roomId: { players: [], gameState, boardState, turn, dice, lastDice, winner } }
        this.io = null;

        // Ludo Constants
        this.SAFE_POSITIONS = [1, 9, 14, 22, 27, 35, 40, 48];
        this.START_POSITIONS = { 0: 1, 1: 27 }; // Player 0 starts at 1, Player 1 at 27
        this.HOME_PATH_START = { 0: 51, 1: 25 };
        this.TOTAL_CELLS = 52;
    }

    init(io) {
        this.io = io;
    }

    async joinRoom(socket, userId, amount) {
        const stake = Number(amount);
        const name = socket.user.name;
        const avatar = socket.user.avatar;

        // Find a waiting room or create one
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
                players: [{ id: userId, name, avatar, socketId: socket.id, color: 'red' }],
                gameState: 'WAITING',
                boardState: {
                    tokens: {
                        0: [-1, -1, -1, -1], // -1 = base, 0-51 = common, 101-106 = home path
                        1: [-1, -1, -1, -1]
                    }
                },
                turn: 0,
                dice: 1,
                rolled: false,
                lastUpdate: Date.now()
            };
        } else {
            const room = this.rooms[roomId];
            if (room.players[0].id === userId) return; // Don't join same room

            room.players.push({ id: userId, name, avatar, socketId: socket.id, color: 'blue' });
            room.gameState = 'PLAYING';
            room.turn = Math.floor(Math.random() * 2); // Random starting player
            this.startGame(roomId);
        }

        socket.join(roomId);
        this.emitState(roomId);
    }

    startGame(roomId) {
        const room = this.rooms[roomId];
        this.io.to(roomId).emit('game_started', {
            players: room.players,
            turn: room.turn
        });
        this.startTurnTimer(roomId);
    }

    startTurnTimer(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        if (room.timer) clearTimeout(room.timer);

        room.turnDeadline = Date.now() + 15000; // 15 seconds per turn
        room.timer = setTimeout(() => {
            this.handleTimeout(roomId);
        }, 15500);
    }

    handleTimeout(roomId) {
        const room = this.rooms[roomId];
        if (!room || room.gameState !== 'PLAYING') return;

        if (!room.rolled) {
            // Auto roll
            this.rollDice(room.players[room.turn].id, roomId);
            // After auto-roll, wait 3 seconds then auto-move or skip
            setTimeout(() => {
                const updatedRoom = this.rooms[roomId];
                if (updatedRoom && updatedRoom.rolled) {
                    this.autoMove(roomId);
                }
            }, 2000);
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

        // Check if any move is possible
        const possibleMoves = this.getPossibleMoves(roomId);
        if (possibleMoves.length === 0) {
            setTimeout(() => this.nextTurn(roomId), 1500);
        } else if (possibleMoves.length === 1 && dice !== 6) {
            // Optional: auto move if only 1 choice? Better to let user click for feel.
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

        if (currentPos === -1) {
            nextPos = this.START_POSITIONS[playerIndex];
        } else if (currentPos >= 101) {
            nextPos = currentPos + dice;
        } else {
            // Check for home path entrance
            let stepsLeft = dice;
            let tempPos = currentPos;
            let enteredHome = false;

            for (let s = 0; s < dice; s++) {
                if (tempPos === this.HOME_PATH_START[playerIndex]) {
                    nextPos = 101 + (dice - s - 1);
                    enteredHome = true;
                    break;
                }
                tempPos = (tempPos % this.TOTAL_CELLS) + 1;
            }
            if (!enteredHome) nextPos = tempPos;
        }

        // Apply Move
        room.boardState.tokens[playerIndex][tokenIndex] = nextPos;

        // Kill logic
        let killed = false;
        if (nextPos <= 52 && !this.SAFE_POSITIONS.includes(nextPos)) {
            const opponentIndex = 1 - playerIndex;
            const oppTokens = room.boardState.tokens[opponentIndex];
            oppTokens.forEach((opos, oi) => {
                if (opos === nextPos) {
                    room.boardState.tokens[opponentIndex][oi] = -1;
                    killed = true;
                }
            });
        }

        this.io.to(roomId).emit('token_moved', {
            playerIndex,
            tokenIndex,
            nextPos,
            tokens: room.boardState.tokens,
            killed
        });

        // Check Winner
        if (room.boardState.tokens[playerIndex].every(p => p === 106)) {
            this.endGame(roomId, userId);
            return;
        }

        // Extra turn on 6 or kill
        if (dice === 6 || killed) {
            room.rolled = false;
            this.startTurnTimer(roomId);
            this.emitState(roomId);
        } else {
            this.nextTurn(roomId);
        }
    }

    autoMove(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        const possible = this.getPossibleMoves(roomId);
        if (possible.length > 0) {
            this.moveToken(room.players[room.turn].id, roomId, possible[0]);
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

    async endGame(roomId, winnerId) {
        const room = this.rooms[roomId];
        room.gameState = 'FINISHED';
        room.winner = winnerId;
        if (room.timer) clearTimeout(room.timer);

        const stake = room.stake;
        const prize = stake * 1.8;

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

        this.io.to(roomId).emit('game_over', { winnerId, prize });
        setTimeout(() => delete this.rooms[roomId], 10000);
    }

    emitState(roomId) {
        const room = this.rooms[roomId];
        if (!room) return;
        this.io.to(roomId).emit('ludo_state', {
            players: room.players,
            gameState: room.gameState,
            board: room.boardState,
            turn: room.turn,
            dice: room.dice,
            rolled: room.rolled,
            turnDeadline: room.turnDeadline
        });
    }

    handleDisconnect(socketId) {
        const roomId = Object.keys(this.rooms).find(id =>
            this.rooms[id].players.some(p => p.socketId === socketId)
        );
        if (roomId) {
            const room = this.rooms[roomId];
            if (room.gameState === 'PLAYING') {
                const winner = room.players.find(p => p.socketId !== socketId);
                if (winner) this.endGame(roomId, winner.id);
            } else {
                delete this.rooms[roomId];
            }
        }
    }
}

module.exports = new LudoManager();
