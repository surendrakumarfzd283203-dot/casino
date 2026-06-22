const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Connect to MongoDB
require("./db");

// Models
const User = require("./models/User");
const Admin = require("./models/Admin");
const Transaction = require("./models/Transaction");
const DepositRequest = require("./models/DepositRequest");

const auth = require("./middleware/auth");
const { playAviator, setForcedMultiplier } = require("./games/aviator");
const { playBigSmall } = require("./games/bigsmall");
const teenPattiManager = require("./games/teenPattiManager");
const colorGameManager = require("./games/colorGameManager");
const luckyDrawManager = require("./games/luckyDrawManager");
const spinGameManager = require("./games/spinGameManager");
const rummyManager = require("./games/rummyManager");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Serve Frontend static files
app.use(express.static(path.join(__dirname, "../Frontend")));
app.use("/admin", express.static(path.join(__dirname, "../admin")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../Frontend", "index.html"));
});

// Ensure uploads directory exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const SECRET = process.env.JWT_SECRET || "solo_secret_key";
const DEFAULT_UPI = process.env.DEFAULT_UPI || "954870514001@ybl";

// Admin Authentication Middleware
const adminAuth = (req, res, next) => {
    try {
        const token = req.headers.authorization;
        if (!token) {
            return res.status(401).json({ success: false, message: "Token Missing" });
        }

        const decoded = jwt.verify(token, SECRET);
        if (decoded.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid Token" });
    }
};

// --- AUTH ROUTES ---

app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.json({ success: false, message: "All fields required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.json({ success: false, message: "Email Already Exists" });
        }

        const hash = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hash });
        await newUser.save();

        res.json({ success: true, message: "Registration Successful" });
    } catch (error) {
        console.error("Server Register Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`Login attempt for: ${email}`);

        const user = await User.findOne({ email });
        if (!user) {
            console.log("User not found");
            return res.json({ success: false, message: "User Not Found" });
        }

        console.log("Comparing password hash...");
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            console.log("Password mismatch");
            return res.json({ success: false, message: "Wrong Password" });
        }

        console.log("Generating token...");
        const token = jwt.sign({ id: user._id }, SECRET, { expiresIn: "7d" });
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                coins: user.coins
            }
        });
    } catch (error) {
        console.error("Login Error Details:", error);
        res.status(500).json({ success: false, message: `Server Error: ${error.message}` });
    }
});

app.post("/api/admin/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`Admin login attempt for: ${username}`);

        // Initial Admin Check
        let admin = await Admin.findOne({ username });
        if (!admin && username === (process.env.ADMIN_USERNAME || "admin")) {
            console.log("Admin not found in DB, creating default admin...");
            // Create default admin if not exists
            const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin123", 10);
            admin = new Admin({
                username: process.env.ADMIN_USERNAME || "admin",
                password: hash
            });
            await admin.save();
            console.log("Default admin created successfully.");
        }

        if (!admin) {
            console.log("Admin login failed: User not found");
            return res.json({ success: false, message: "Admin Not Found" });
        }

        const match = await bcrypt.compare(password, admin.password);
        if (!match) {
            console.log("Admin login failed: Wrong password");
            return res.json({ success: false, message: "Wrong Password" });
        }

        console.log("Admin login successful!");
        const token = jwt.sign({ adminId: admin._id, role: "admin" }, SECRET, { expiresIn: "7d" });
        res.json({ success: true, token });
    } catch (error) {
        console.error("Admin Login Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- USER ROUTES ---

app.get("/api/profile", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("name email coins avatar");
        if (!user) {
            return res.json({ success: false, message: "User Not Found" });
        }
        res.json({ success: true, user: { ...user.toObject(), id: user._id } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

app.post("/api/update-profile", auth, async (req, res) => {
    try {
        const { name } = req.body;
        await User.findByIdAndUpdate(req.user.id, { name });
        res.json({ success: true, message: "Profile Updated" });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post("/api/change-password", auth, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.json({ success: false, message: "User Not Found" });
        }

        const match = await bcrypt.compare(oldPassword, user.password);
        if (!match) {
            return res.json({ success: false, message: "Old Password Wrong" });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        user.password = hash;
        await user.save();

        res.json({ success: true, message: "Password Changed" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.get("/api/leaderboard", async (req, res) => {
    try {
        const users = await User.find({}).sort({ coins: -1 }).limit(20).select("name coins");
        res.json(users);
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

app.get("/api/wallet", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("coins");
        if (!user) {
            return res.status(500).json({ success: false, message: "Unable to load wallet" });
        }
        res.json({ success: true, balance: user.coins, upiId: DEFAULT_UPI });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

app.get("/api/wallet/transactions", auth, async (req, res) => {
    try {
        const transactions = await DepositRequest.find({ user_id: req.user.id }).sort({ created_at: -1 });
        res.json({ success: true, transactions: transactions.map(t => ({ ...t.toObject(), id: t._id })) });
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to load requests" });
    }
});

app.get("/api/transactions", auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user_id: req.user.id }).sort({ created_at: -1 });
        res.json({ success: true, transactions });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post("/api/wallet/request-withdrawal", auth, async (req, res) => {
    try {
        const { amount, upiId, note } = req.body;
        const parsedAmount = Number(amount);
        if (!parsedAmount || parsedAmount < 100) {
            return res.json({ success: false, message: "Minimum withdrawal is 100" });
        }

        const user = await User.findById(req.user.id);
        if (user.coins < parsedAmount) {
            return res.json({ success: false, message: "Insufficient coins" });
        }

        const commissionRate = 0.05; // 5% Admin Commission
        const commission = parsedAmount * commissionRate;
        const finalAmount = parsedAmount - commission;

        // Deduct coins immediately and create pending transaction
        user.coins -= parsedAmount;
        await user.save();

        const txn = new Transaction({
            user_id: req.user.id,
            amount: -parsedAmount,
            type: "withdraw",
            status: "pending",
            commission: commission,
            details: `Withdrawal request to ${upiId}. Final amount: ${finalAmount} (Comm: ${commission})`
        });
        await txn.save();

        res.json({ success: true, message: "Withdrawal request submitted for approval" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post("/api/wallet/request-deposit", auth, async (req, res) => {
    try {
        const { amount, reference } = req.body;
        const parsedAmount = Number(amount);
        if (!parsedAmount || parsedAmount < 10) {
            return res.json({ success: false, message: "Minimum deposit is 10" });
        }

        const txn = new Transaction({
            user_id: req.user.id,
            amount: parsedAmount,
            type: "deposit",
            status: "pending",
            details: `Deposit via UPI. Ref: ${reference || 'N/A'}`
        });
        await txn.save();

        res.json({ success: true, message: "Deposit request submitted. Waiting for admin approval." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- GAME ROUTES ---

app.get("/api/game/bigsmall/state", auth, (req, res) => {
    res.json({ success: true, ...bigSmallManager.getGameState() });
});

app.post("/api/game/bigsmall/bet", auth, async (req, res) => {
    const { prediction, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.coins < amount) return res.json({ success: false, message: "Insufficient coins" });

    const betRes = bigSmallManager.placeBet(req.user.id, user.name, prediction, amount);
    if (betRes.success) {
        user.coins -= amount;
        await user.save();
    }
    res.json(betRes);
});

app.get("/api/game/color/state", auth, (req, res) => {
    res.json({ success: true, ...colorGameManager.getGameState() });
});

app.post("/api/game/color/bet", auth, async (req, res) => {
    const { type, value, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.coins < amount) return res.json({ success: false, message: "Insufficient coins" });

    const betRes = colorGameManager.placeBet(req.user.id, user.name, type, value, amount);
    if (betRes.success) {
        user.coins -= amount;
        await user.save();
    }
    res.json(betRes);
});

app.get("/api/game/luckydraw/state", auth, (req, res) => {
    res.json({ success: true, ...luckyDrawManager.getGameState() });
});

app.post("/api/game/luckydraw/bet", auth, async (req, res) => {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.coins < amount) return res.json({ success: false, message: "Insufficient coins" });

    const betRes = luckyDrawManager.placeBet(req.user.id, user.name, amount);
    if (betRes.success) {
        user.coins -= amount;
        await user.save();
    }
    res.json(betRes);
});

app.get("/api/game/spin/state", auth, (req, res) => {
    res.json({ success: true, ...spinGameManager.getGameState() });
});

app.post("/api/game/spin/bet", auth, async (req, res) => {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.coins < amount) return res.json({ success: false, message: "Insufficient coins" });

    const betRes = spinGameManager.placeBet(req.user.id, user.name, amount);
    if (betRes.success) {
        user.coins -= amount;
        await user.save();
    }
    res.json(betRes);
});

app.get("/api/game/rummy/tables", auth, (req, res) => {
    res.json({ success: true, tables: rummyManager.getTables() });
});

app.post("/api/game/rummy/join", auth, async (req, res) => {
    const { tableId, amount } = req.body;
    const betAmount = Number(amount);

    if (isNaN(betAmount) || betAmount < 10 || betAmount > 500) {
        return res.json({ success: false, message: "Bet must be between 10 and 500" });
    }

    const user = await User.findById(req.user.id);
    if (user.coins < betAmount) return res.json({ success: false, message: "Insufficient coins" });

    const betRes = rummyManager.placeBet(tableId, req.user.id, user.name, betAmount);
    if (betRes.success) {
        user.coins -= betAmount;
        await user.save();
    }
    res.json(betRes);
});

let forcedBigSmallResult = null;
let activeBets = {
    aviator: [] // [{ userId, name, betAmount, cashOutMultiplier }]
};

// --- AVIATOR AUTOMATION (1 MINUTE ROUNDS) ---
let aviatorState = {
    roundId: Date.now(),
    timer: 60, // 1 minute
    isFlying: false,
    crashMultiplier: 1.5,
    history: []
};

setInterval(() => {
    if (aviatorState.timer > 0) {
        aviatorState.timer--;
    } else {
        if (!aviatorState.isFlying) {
            startAviatorFlight();
        }
    }
}, 1000);

async function startAviatorFlight() {
    aviatorState.isFlying = true;

    // Calculate total pool for admin to see
    const totalBet = activeBets.aviator.reduce((acc, b) => acc + b.betAmount, 0);
    console.log(`Aviator Round ${aviatorState.roundId} Flying. Pool: ${totalBet}`);

    // Wait for crash (simulated duration based on multiplier)
    const flightDuration = Math.min(aviatorState.crashMultiplier * 2000, 15000);

    setTimeout(async () => {
        // Resolve Bets
        for (let bet of activeBets.aviator) {
            const user = await User.findById(bet.userId);
            if (!user) continue;

            // Simple logic: if user cashOutMultiplier <= crashMultiplier, they win
            if (bet.cashOutMultiplier <= aviatorState.crashMultiplier) {
                const winAmount = Math.floor(bet.betAmount * bet.cashOutMultiplier);
                user.coins += winAmount;
                await user.save();

                await new Transaction({
                    user_id: bet.userId,
                    amount: winAmount - bet.betAmount,
                    type: "game_aviator",
                    details: `Won at ${bet.cashOutMultiplier}x (Crash: ${aviatorState.crashMultiplier}x)`
                }).save();

                await Admin.findOneAndUpdate({}, { $inc: { balance: -(winAmount - bet.betAmount) } });
            } else {
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.betAmount,
                    type: "game_aviator",
                    details: `Crashed at ${aviatorState.crashMultiplier}x (Target: ${bet.cashOutMultiplier}x)`
                }).save();

                await Admin.findOneAndUpdate({}, { $inc: { balance: bet.betAmount } });
            }
        }

        aviatorState.history.unshift({ roundId: aviatorState.roundId, crash: aviatorState.crashMultiplier });
        if (aviatorState.history.length > 10) aviatorState.history.pop();

        // Reset
        aviatorState.roundId = Date.now();
        aviatorState.timer = 60;
        aviatorState.isFlying = false;
        activeBets.aviator = [];
    }, flightDuration);
}

app.get("/api/game/aviator/state", auth, (req, res) => {
    res.json({ success: true, ...aviatorState, activeBets: activeBets.aviator });
});

app.post("/api/play/aviator", auth, async (req, res) => {
    try {
        const { betAmount, cashOutMultiplier } = req.body;
        const userId = req.user.id;

        if (!betAmount || betAmount <= 0) return res.json({ success: false, message: "Invalid bet" });
        if (aviatorState.timer < 5 || aviatorState.isFlying) return res.json({ success: false, message: "Round already started" });

        const user = await User.findById(userId);
        if (user.coins < betAmount) return res.json({ success: false, message: "Insufficient coins" });

        user.coins -= betAmount;
        await user.save();

        activeBets.aviator.push({
            userId,
            name: user.name,
            betAmount: Number(betAmount),
            cashOutMultiplier: Number(cashOutMultiplier)
        });

        res.json({ success: true, message: "Bet placed" });
    } catch (error) { res.status(500).json({ success: false }); }
});



app.get("/api/teenpatti/tables", auth, (req, res) => {
    res.json({ success: true, tables: teenPattiManager.getTables() });
});

app.post("/api/teenpatti/bet", auth, async (req, res) => {
    try {
        const { tableId, betAmount } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) return res.status(500).json({ success: false, message: "User not found" });

        if (user.coins < betAmount) return res.json({ success: false, message: "Insufficient coins" });

        const betRes = teenPattiManager.placeBet(tableId, userId, user.name, betAmount);
        if (betRes.success) {
            user.coins -= betAmount;
            await user.save();
            res.json({ success: true, message: "Bet placed successfully" });
        } else {
            res.json(betRes);
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- ADMIN ROUTES ---

app.get("/api/admin/stats", adminAuth, async (req, res) => {
    try {
        // Use live active bets instead of history for real-time monitoring
        const bigSmallState = bigSmallManager.getGameState();
        stats.liveBets = {
            color: colorGameManager.getLiveBets(),
            luckydraw: luckyDrawManager.bets,
            spin: spinGameManager.bets,
            rummy: rummyManager.getTables().map(t => ({ id: t.id, players: t.players })),
            bigsmall: {
                BIG: bigSmallState.activeBets.filter(b => b.prediction === 'BIG').reduce((a, b) => a + b.amount, 0),
                SMALL: bigSmallState.activeBets.filter(b => b.prediction === 'SMALL').reduce((a, b) => a + b.amount, 0)
            },
            teenpatti: teenPattiManager.getTables().map(t => ({ id: t.id, players: t.players })),
            aviator: activeBets.aviator
        };

        const admin = await Admin.findOne({});
        stats.adminWalletBalance = admin ? admin.balance : 0;

        const pendingDeposits = await DepositRequest.countDocuments({ status: "pending", payment_method: { $ne: "withdraw" } });
        stats.pendingDeposits = pendingDeposits;

        const pendingWithdrawals = await DepositRequest.countDocuments({ status: "pending", payment_method: "withdraw" });
        stats.pendingWithdrawals = pendingWithdrawals;

        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post("/api/admin/force-result", adminAuth, (req, res) => {
    const { game, result, tableId, multiplier, number, autoOpen } = req.body;
    if (game === 'bigsmall') {
        if (autoOpen !== undefined) {
            bigSmallManager.autoOpen = autoOpen;
            return res.json({ success: true, message: `Auto Open set to: ${autoOpen}` });
        }
        bigSmallManager.forcedResult = result;
        return res.json({ success: true, message: `Next BIG/SMALL result set to: ${result || 'Random'}` });
    } else if (game === 'aviator') {
        aviatorState.crashMultiplier = Number(multiplier);
        return res.json({ success: true, message: `Next Aviator crash set to: ${multiplier}x` });
    } else if (game === 'teenpatti') {
        teenPattiManager.forceResult(tableId, result);
        return res.json({ success: true, message: `Table ${tableId} forced result set to: ${result}` });
    } else if (game === 'color') {
        if (autoOpen !== undefined) {
            colorGameManager.toggleAutoOpen(autoOpen);
            return res.json({ success: true, message: `Auto Open set to: ${autoOpen}` });
        }
        colorGameManager.forceNextResult(number);
        return res.json({ success: true, message: `Next Color Game number set to: ${number}` });
    } else if (game === 'luckydraw') {
        luckyDrawManager.forceJackpot();
        return res.json({ success: true, message: "Next Lucky Draw set to 777" });
    } else if (game === 'spin') {
        spinGameManager.forceResult(result);
        return res.json({ success: true, message: `Next Spin result index set to: ${result}` });
    } else if (game === 'rummy') {
        rummyManager.forceWinner(tableId, result); // result is winner userId
        return res.json({ success: true, message: `Next Rummy winner set for Table ${tableId}` });
    }
    res.json({ success: false, message: "Invalid game" });
});

app.get("/api/admin/game-logs", adminAuth, async (req, res) => {
    try {
        const logs = await Transaction.find({ type: { $regex: /^game_/ } })
            .populate("user_id", "name email")
            .sort({ created_at: -1 })
            .limit(50);

        const formattedLogs = logs.map(l => ({
            ...l.toObject(),
            id: l._id,
            name: l.user_id ? l.user_id.name : "Deleted User",
            email: l.user_id ? l.user_id.email : ""
        }));
        res.json(formattedLogs);
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get("/api/admin/users", adminAuth, async (req, res) => {
    try {
        const users = await User.find({}).sort({ created_at: -1 });
        res.json(users.map(u => ({ ...u.toObject(), id: u._id })));
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

app.get("/api/admin/user/:id", adminAuth, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json({ ...user.toObject(), id: user._id });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

app.get("/api/admin/search-user/:keyword", adminAuth, async (req, res) => {
    try {
        const keyword = req.params.keyword;
        const users = await User.find({
            $or: [
                { name: { $regex: keyword, $options: "i" } },
                { email: { $regex: keyword, $options: "i" } }
            ]
        });
        res.json(users.map(u => ({ ...u.toObject(), id: u._id })));
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

app.post("/api/admin/block-user", adminAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.body.userId, { status: "blocked" });
        res.json({ success: true, message: "User Blocked" });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post("/api/admin/unblock-user", adminAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.body.userId, { status: "active" });
        res.json({ success: true, message: "User Activated" });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post("/api/admin/delete-user", adminAuth, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.body.userId);
        res.json({ success: true, message: "User Deleted Successfully" });
    } catch (error) {
        res.json({ success: false, message: "Error deleting user" });
    }
});

app.get("/api/admin/deposits", adminAuth, async (req, res) => {
    try {
        const deposits = await DepositRequest.find({})
            .populate("user_id", "name email")
            .sort({ created_at: -1 });

        const formatted = deposits.map(d => ({
            ...d.toObject(),
            id: d._id,
            name: d.user_id ? d.user_id.name : "Deleted User",
            email: d.user_id ? d.user_id.email : ""
        }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to load deposit requests" });
    }
});

app.get("/api/admin/pending-requests", adminAuth, async (req, res) => {
    try {
        const requests = await Transaction.find({ status: "pending" })
            .populate("user_id", "name email coins")
            .sort({ created_at: -1 });
        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post("/api/admin/approve-request", adminAuth, async (req, res) => {
    try {
        const { requestId } = req.body;
        const txn = await Transaction.findById(requestId);
        if (!txn || txn.status !== 'pending') return res.json({ success: false, message: "Invalid request" });

        if (txn.type === 'deposit') {
            await User.findByIdAndUpdate(txn.user_id, { $inc: { coins: txn.amount } });
            await Admin.findOneAndUpdate({}, { $inc: { balance: -txn.amount } }); // Reversing profit since it's a deposit inflow
        } else if (txn.type === 'withdraw') {
            // Commission already handled at request time by deducting full amount
            // and tracking commission in the txn object.
            // Admin balance increase (profit)
            await Admin.findOneAndUpdate({}, { $inc: { balance: txn.commission } });
        }

        txn.status = 'completed';
        await txn.save();
        res.json({ success: true, message: "Request approved" });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post("/api/admin/reject-request", adminAuth, async (req, res) => {
    try {
        const { requestId } = req.body;
        const txn = await Transaction.findById(requestId);
        if (!txn || txn.status !== 'pending') return res.json({ success: false, message: "Invalid request" });

        if (txn.type === 'withdraw') {
            // Return coins to user
            await User.findByIdAndUpdate(txn.user_id, { $inc: { coins: Math.abs(txn.amount) } });
        }

        txn.status = 'rejected';
        await txn.save();
        res.json({ success: true, message: "Request rejected" });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post("/api/admin/update-coins", adminAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.body.userId, { coins: req.body.coins });
        res.json({ success: true, message: "Coins Updated" });
    } catch (error) {
        res.json({ success: false });
    }
});

// --- FILE UPLOAD ---

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    },
});

const upload = multer({ storage });

app.post("/api/upload-avatar", auth, upload.single("avatar"), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, message: "No file uploaded" });
        }
        const avatar = req.file.filename;
        await User.findByIdAndUpdate(req.user.id, { avatar });
        res.json({ success: true, avatar });
    } catch (error) {
        console.error("Avatar upload error:", error);
        res.json({ success: false, message: "Database error" });
    }
});

app.post("/api/daily-bonus", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(500).json({ success: false, message: "Unable to load bonus status" });
        }

        const lastBonus = user.last_bonus;
        const now = new Date();

        if (lastBonus) {
            const lastDate = new Date(lastBonus).toDateString();
            const today = now.toDateString();
            if (lastDate === today) {
                return res.json({ success: false, message: "Already claimed today! Come back tomorrow." });
            }
        }

        const bonusAmount = 50;
        user.coins += bonusAmount;
        user.last_bonus = now;
        await user.save();

        res.json({ success: true, message: `+${bonusAmount} Coins Added!` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to add bonus" });
    }
});

app.get("/api/db-status", async (req, res) => {
    try {
        const state = mongoose.connection.readyState;
        const states = ["Disconnected", "Connected", "Connecting", "Disconnecting"];
        res.json({ success: true, status: states[state], db: mongoose.connection.name });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.get("/api/health", (req, res) => {
    res.json({ success: true, message: "Solo Casino Demo API Running with MongoDB" });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server Running On Port ${PORT}`);
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        const fallbackPort = PORT + 1;
        console.error(`Port ${PORT} already in use. Trying port ${fallbackPort}...`);
        app.listen(fallbackPort, () => {
            console.log(`🚀 Server Running On Port ${fallbackPort}`);
        }).on("error", (error) => {
            console.error(`Failed to bind fallback port ${fallbackPort}:`, error.message);
            process.exit(1);
        });
        return;
    }
    console.error(err);
    process.exit(1);
});
