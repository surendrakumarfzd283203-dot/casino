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
const bigSmallManager = require("./games/bigSmallManager");
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
        const { name, email, password, referral } = req.body;
        if (!name || !email || !password) {
            return res.json({ success: false, message: "All fields required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.json({ success: false, message: "Email Already Exists" });
        }

        let referredBy = null;
        if (referral) {
            const referrer = await User.findOne({ referral_code: referral });
            if (referrer) referredBy = referrer._id;
        }

        const hash = await bcrypt.hash(password, 10);
        const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const newUser = new User({
            name, email, password: hash,
            referral_code: referralCode,
            referred_by: referredBy,
            coins: 0
        });
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
        const user = await User.findById(req.user.id).select("name email coins avatar referral_code");
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
        const transactions = await Transaction.find({ user_id: req.user.id }).sort({ created_at: -1 });
        res.json({ success: true, transactions: transactions.map(t => ({ ...t.toObject(), id: t._id })) });
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to load transactions" });
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
        user.referral_played = true; // Mark that user has played at least once
        await user.save();
    }
    res.json(betRes);
});

let forcedBigSmallResult = null;
let forcedAviatorMultiplier = null;
let activeBets = {
    aviator: [] // [{ userId, name, betAmount, cashOutMultiplier }]
};

let aviatorFakeUsers = [];
function updateAviatorFakeUsers() {
    const count = Math.floor(Math.random() * 101) + 200; // 200-300
    const names = ["Rahul", "Amit", "Priya", "Sonia", "Vikram", "Anjali", "Arjun", "Sneha", "Kabir", "Ishita", "Rohan", "Maya", "Deepak", "Karan", "Simran", "Raj", "Pooja", "Aditya", "Meera", "Yash"];
    aviatorFakeUsers = [];
    for (let i = 0; i < count; i++) {
        aviatorFakeUsers.push({
            name: names[Math.floor(Math.random() * names.length)] + " " + (Math.floor(Math.random() * 900) + 100),
            betAmount: [10, 50, 100, 500, 1000, 2000][Math.floor(Math.random() * 6)],
            cashOutAt: (1.1 + Math.random() * 3).toFixed(2),
            isFake: true
        });
    }
}
updateAviatorFakeUsers();

// --- AVIATOR AUTOMATION (20 SECOND BETTING GAP) ---
let aviatorState = {
    roundId: Date.now(),
    timer: 20, // 20 seconds betting time
    isFlying: false,
    crashMultiplier: 2.0,
    history: [],
    currentFakeCount: 50
};

setInterval(() => {
    if (aviatorState.timer > 0) {
        aviatorState.timer--;
        if (aviatorState.timer === 19) {
            updateAviatorFakeUsers();
            aviatorState.currentFakeCount = Math.floor(Math.random() * 120) + 80;
        }
        // Fluctuate a bit during betting phase
        if (!aviatorState.isFlying && aviatorState.timer < 18) {
             aviatorState.currentFakeCount += Math.floor(Math.random() * 3);
        }
    } else {
        if (!aviatorState.isFlying) {
            startAviatorFlight();
        }
    }
}, 1000);

async function startAviatorFlight() {
    aviatorState.isFlying = true;

    // Choose crash multiplier (rigged or random)
    if (forcedAviatorMultiplier) {
        aviatorState.crashMultiplier = Number(forcedAviatorMultiplier);
        forcedAviatorMultiplier = null;
    } else {
        const rand = Math.random();
        if (rand < 0.7) aviatorState.crashMultiplier = 1.0 + Math.random() * 1.5;
        else aviatorState.crashMultiplier = 1.5 + Math.random() * 5.0;
    }

    // Flight duration based on multiplier
    const flightDuration = Math.floor(Math.log(aviatorState.crashMultiplier) / Math.log(1.1) * 1000);

    setTimeout(async () => {
        // Round Crashed
        aviatorState.history.unshift({ roundId: aviatorState.roundId, crash: aviatorState.crashMultiplier });
        if (aviatorState.history.length > 20) aviatorState.history.pop();

        // Process losers (those who didn't cash out)
        for (let bet of activeBets.aviator) {
            if (!bet.cashedOut) {
                await new Transaction({
                    user_id: bet.userId,
                    amount: -bet.betAmount,
                    type: "game_aviator",
                    details: `Crashed at ${aviatorState.crashMultiplier.toFixed(2)}x`
                }).save();
                await Admin.findOneAndUpdate({}, { $inc: { balance: bet.betAmount } });
            }
        }

        // Reset for next round
        aviatorState.roundId = Date.now();
        aviatorState.timer = 20; // 20 seconds gap
        aviatorState.isFlying = false;
        activeBets.aviator = [];
    }, flightDuration);
}

app.get("/api/game/aviator/state", auth, (req, res) => {
    res.json({
        success: true,
        ...aviatorState,
        activeBets: activeBets.aviator,
        fakeUsers: aviatorFakeUsers.slice(0, aviatorState.currentFakeCount)
    });
});

app.post("/api/play/aviator", auth, async (req, res) => {
    try {
        const { betAmount, cashOutMultiplier, slot } = req.body;
        const userId = req.user.id;

        if (!betAmount || betAmount < 10) return res.json({ success: false, message: "Minimum bet is 10 INR" });
        if (aviatorState.isFlying) return res.json({ success: false, message: "Round already started" });

        const user = await User.findById(userId);
        if (user.coins < betAmount) return res.json({ success: false, message: "Insufficient coins" });

        user.coins -= betAmount;
        user.referral_played = true; // Mark that user has played at least once
        await user.save();

        activeBets.aviator.push({
            userId,
            name: user.name,
            betAmount: Number(betAmount),
            cashOutMultiplier: Number(cashOutMultiplier),
            cashedOut: false,
            multiplier: 0,
            winAmount: 0,
            slot: slot || 1, // Store slot (1 or 2)
            timestamp: Date.now()
        });

        res.json({ success: true, message: "Bet placed" });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post("/api/game/aviator/cancel", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const index = activeBets.aviator.findIndex(b => b.userId.toString() === userId.toString());
        if (index === -1) return res.json({ success: false, message: "Bet not found" });

        const bet = activeBets.aviator[index];
        await User.findByIdAndUpdate(userId, { $inc: { coins: bet.betAmount } });
        activeBets.aviator.splice(index, 1);

        res.json({ success: true, message: "Bet cancelled and refunded" });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post("/api/game/aviator/cashout", auth, async (req, res) => {
    try {
        const { multiplier, slot } = req.body;
        const userId = req.user.id;

        const betIndex = activeBets.aviator.findIndex(b =>
            b.userId.toString() === userId.toString() &&
            !b.cashedOut &&
            (slot === undefined || b.slot === slot)
        );
        if (betIndex === -1) return res.json({ success: false, message: "No active bet" });

        const bet = activeBets.aviator[betIndex];
        const winAmount = Math.floor(bet.betAmount * multiplier);

        const user = await User.findById(userId);
        user.coins += winAmount;
        await user.save();

        await new Transaction({
            user_id: userId,
            amount: winAmount - bet.betAmount,
            type: "game_aviator",
            details: `Cashed out at ${multiplier}x`
        }).save();

        await Admin.findOneAndUpdate({}, { $inc: { balance: -(winAmount - bet.betAmount) } });

        // Mark as cashed out instead of removing immediately
        bet.cashedOut = true;
        bet.multiplier = multiplier;
        bet.winAmount = winAmount;

        res.json({ success: true, winAmount, newBalance: user.coins });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post("/api/teenpatti/join", auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    const result = teenPattiManager.joinTable(req.body.tableId, req.user.id, user.name);
    res.json(result);
});

app.post("/api/teenpatti/move", auth, async (req, res) => {
    const { tableId, move, amount, targetId } = req.body;
    const result = await teenPattiManager.makeMove(req.user.id, move, amount, tableId, targetId);
    res.json(result);
});

app.post("/api/teenpatti/sideshow-response", auth, (req, res) => {
    const { tableId, accepted } = req.body;
    const result = teenPattiManager.respondSideShow(tableId, req.user.id, accepted);
    res.json(result);
});



app.get("/api/teenpatti/tables", auth, (req, res) => {
    res.json({ success: true, tables: teenPattiManager.getTables(req.user.id) });
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
        const stats = {};

        // Use live active bets instead of history for real-time monitoring
        const bigSmallState = bigSmallManager.getGameState();
        const colorState = colorGameManager.getGameState();
        const luckyState = luckyDrawManager.getGameState();
        const spinState = spinGameManager.getGameState();

        stats.aviatorState = aviatorState;
        stats.colorState = colorState;
        stats.luckyState = luckyState;
        stats.spinState = spinState;
        stats.bigSmallState = bigSmallState;

        stats.liveBets = {
            color: colorGameManager.getLiveBets(),
            colorStats: colorGameManager.getBetStats(),
            luckydraw: luckyDrawManager.bets,
            spin: spinGameManager.bets,
            rummy: rummyManager.getTables().map(t => ({ id: t.id, players: t.players })),
            bigsmall: {
                BIG: bigSmallState.activeBets.filter(b => b.prediction === 'BIG').reduce((a, b) => a + b.amount, 0),
                SMALL: bigSmallState.activeBets.filter(b => b.prediction === 'SMALL').reduce((a, b) => a + b.amount, 0),
                TRIPLE: bigSmallState.activeBets.filter(b => b.prediction === 'TRIPLE').reduce((a, b) => a + b.amount, 0),
                bets: bigSmallState.activeBets
            },
            teenpatti: teenPattiManager.getTables(null, true).map(t => ({ id: t.id, players: t.players, pot: t.pot })),
            aviator: activeBets.aviator
        };

        const totalUsers = await User.countDocuments({});
        const onlineUsers = await User.countDocuments({ last_seen: { $gt: new Date(Date.now() - 5 * 60 * 1000) } });
        const totalCoinsAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]);
        stats.totalUsers = totalUsers;
        stats.onlineUsers = onlineUsers;
        stats.totalCoins = totalCoinsAgg.length > 0 ? totalCoinsAgg[0].total : 0;

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
        forcedAviatorMultiplier = Number(multiplier);
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
        const deposits = await Transaction.find({ type: "deposit", status: { $ne: "pending" } })
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
        res.status(500).json({ success: false, message: "Unable to load deposit history" });
    }
});

app.get("/api/admin/withdrawals", adminAuth, async (req, res) => {
    try {
        const withdrawals = await Transaction.find({ type: "withdraw", status: { $ne: "pending" } })
            .populate("user_id", "name email")
            .sort({ created_at: -1 });

        const formatted = withdrawals.map(w => ({
            ...w.toObject(),
            id: w._id,
            name: w.user_id ? w.user_id.name : "Deleted User",
            email: w.user_id ? w.user_id.email : ""
        }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to load withdrawal history" });
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

const { checkReferralReward } = require("./utils/referral");

app.post("/api/admin/approve-request", adminAuth, async (req, res) => {
    try {
        const { requestId } = req.body;
        const txn = await Transaction.findById(requestId);
        if (!txn || txn.status !== 'pending') return res.json({ success: false, message: "Invalid request" });

        const user = await User.findById(txn.user_id);
        if (txn.type === 'deposit') {
            user.coins += txn.amount;
            user.total_deposited += txn.amount;
            await user.save();
            await Admin.findOneAndUpdate({}, { $inc: { balance: -txn.amount } });

            // Check Referral Reward
            await checkReferralReward(user._id);
        } else if (txn.type === 'withdraw') {
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
        const { requestId, reason } = req.body;
        const txn = await Transaction.findById(requestId);
        if (!txn || txn.status !== 'pending') return res.json({ success: false, message: "Invalid request" });

        if (txn.type === 'withdraw') {
            // Return coins to user
            await User.findByIdAndUpdate(txn.user_id, { $inc: { coins: Math.abs(txn.amount) } });
        }

        txn.status = 'rejected';
        txn.rejection_reason = reason || "Request rejected by admin";
        await txn.save();
        res.json({ success: true, message: "Request rejected" });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get("/api/admin/user-history/:userId", adminAuth, async (req, res) => {
    try {
        const history = await Transaction.find({ user_id: req.params.userId }).sort({ created_at: -1 });
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get("/api/user/history", auth, async (req, res) => {
    try {
        const history = await Transaction.find({ user_id: req.user.id }).sort({ created_at: -1 });
        res.json({ success: true, history });
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

        if (user.daily_bonus_count >= 7) {
            return res.json({ success: false, message: "Daily bonus is only available for the first 7 days." });
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

        const bonusAmount = 5;
        user.coins += bonusAmount;
        user.last_bonus = now;
        user.daily_bonus_count += 1;
        await user.save();

        await new Transaction({
            user_id: user._id,
            amount: bonusAmount,
            type: 'bonus',
            details: `Day ${user.daily_bonus_count} Bonus`
        }).save();

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
const server = app.listen(PORT, async () => {
    console.log(`🚀 Server Running On Port ${PORT}`);

    // Ensure all users have referral codes
    try {
        const usersWithoutRef = await User.find({ referral_code: { $exists: false } });
        if (usersWithoutRef.length > 0) {
            console.log(`Assigning referral codes to ${usersWithoutRef.length} users...`);
            for (let user of usersWithoutRef) {
                user.referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
                await user.save();
            }
            console.log("Referral codes assigned.");
        }
    } catch (e) { console.error("Referral sync error:", e); }
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
