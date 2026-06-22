const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");

class RummyTable {
    constructor(id) {
        this.id = id;
        this.players = {}; // { userId: { name, betAmount, status: 'active'|'winner' } }
        this.state = 'WAITING'; // WAITING, BETTING, PLAYING, RESOLVING
        this.timer = 0;
        this.forcedWinner = null;
    }

    reset() {
        this.players = {};
        this.state = 'WAITING';
        this.timer = 0;
        this.forcedWinner = null;
    }
}

class RummyManager {
    constructor() {
        this.tables = {
            1: new RummyTable(1),
            2: new RummyTable(2)
        };
        this.startLoop();
    }

    startLoop() {
        setInterval(() => {
            for (let id in this.tables) {
                const table = this.tables[id];
                if (table.timer > 0) {
                    table.timer--;
                } else {
                    if (table.state === 'WAITING' || table.state === 'RESOLVING') {
                        table.reset();
                        table.state = 'BETTING';
                        table.timer = 30;
                    } else if (table.state === 'BETTING') {
                        if (Object.keys(table.players).length >= 2) {
                            table.state = 'PLAYING';
                            table.timer = 15;
                        } else {
                            table.timer = 10; // Wait for more players
                        }
                    } else if (table.state === 'PLAYING') {
                        this.resolveTable(table);
                    }
                }
            }
        }, 1000);
    }

    async resolveTable(table) {
        table.state = 'RESOLVING';
        table.timer = 10;

        const userIds = Object.keys(table.players);
        let winnerId;

        if (table.forcedWinner && userIds.includes(table.forcedWinner)) {
            winnerId = table.forcedWinner;
        } else {
            winnerId = userIds[Math.floor(Math.random() * userIds.length)];
        }

        const totalPool = Object.values(table.players).reduce((acc, p) => acc + p.betAmount, 0);
        const winAmount = Math.floor(totalPool * 0.95); // 5% house edge

        for (let userId of userIds) {
            const isWinner = userId === winnerId;
            table.players[userId].status = isWinner ? 'winner' : 'lost';

            if (isWinner) {
                await User.findByIdAndUpdate(userId, { $inc: { coins: winAmount } });
                const txn = new Transaction({
                    user_id: userId,
                    amount: winAmount - table.players[userId].betAmount,
                    type: "game_rummy",
                    details: `Table ${table.id} WINNER`
                });
                await txn.save();

                // Admin profit from house edge
                const houseProfit = totalPool - winAmount;
                await Admin.findOneAndUpdate({}, { $inc: { balance: houseProfit } });
            } else {
                const txn = new Transaction({
                    user_id: userId,
                    amount: -table.players[userId].betAmount,
                    type: "game_rummy",
                    details: `Table ${table.id} LOST`
                });
                await txn.save();
            }
        }
    }

    placeBet(tableId, userId, name, amount) {
        const table = this.tables[tableId];
        if (!table) return { success: false, message: "Table not found" };
        if (table.state !== 'BETTING') return { success: false, message: "Not in betting phase" };
        if (table.players[userId]) return { success: false, message: "Already in table" };

        table.players[userId] = { name, betAmount: Number(amount), status: 'active' };
        return { success: true };
    }

    getTables() {
        return Object.values(this.tables);
    }

    forceWinner(tableId, userId) {
        if (this.tables[tableId]) this.tables[tableId].forcedWinner = userId;
    }
}

module.exports = new RummyManager();
