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
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: "User Not Found" });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.json({ success: false, message: "Wrong Password" });
        }

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
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post("/api/admin/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        // Initial Admin Check
        let admin = await Admin.findOne({ username });
        if (!admin && username === process.env.ADMIN_USERNAME) {
            // Create default admin if not exists (migrating from env)
            const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin123", 10);
            admin = new Admin({ username, password: hash });
            await admin.save();
        }

        if (!admin) {
            return res.json({ success: false, message: "Admin Not Found" });
        }

        const match = await bcrypt.compare(password, admin.password);
        if (!match) {
            return res.json({ success: false, message: "Wrong Password" });
        }

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

app.post("/api/wallet/request-deposit", auth, async (req, res) => {
    try {
        const { amount, paymentMethod, upiId, reference } = req.body;
        const parsedAmount = Number(amount);
        if (!parsedAmount || parsedAmount <= 0) {
            return res.json({ success: false, message: "Enter a valid amount" });
        }

        const method = paymentMethod === "qr" ? "qr" : "upi";
        const details = method === "qr"
            ? `Scan QR and pay ${parsedAmount} INR to ${DEFAULT_UPI}`
            : `Send ${parsedAmount} INR to ${upiId || DEFAULT_UPI}${reference ? ` | Ref: ${reference}` : ""}`;

        const request = new DepositRequest({
            user_id: req.user.id,
            amount: parsedAmount,
            payment_method: method,
            details: details
        });
        await request.save();

        res.json({ success: true, message: "Deposit request submitted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to submit request" });
    }
});

app.post("/api/wallet/request-withdrawal", auth, async (req, res) => {
    try {
        const { amount, upiId, note } = req.body;
        const parsedAmount = Number(amount);
        if (!parsedAmount || parsedAmount <= 0) {
            return res.json({ success: false, message: "Enter a valid amount" });
        }
        if (!upiId) {
            return res.json({ success: false, message: "Provide a withdrawal UPI ID" });
        }

        const details = `Withdraw ${parsedAmount} INR to ${upiId}${note ? ` | Note: ${note}` : ""}`;
        const request = new DepositRequest({
            user_id: req.user.id,
            amount: parsedAmount,
            payment_method: "withdraw",
            details: details
        });
        await request.save();

        res.json({ success: true, message: "Withdrawal request submitted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to submit withdrawal request" });
    }
});

// --- GAME ROUTES ---

let forcedBigSmallResult = null;
let activeBets = {
    bigsmall: { BIG: 0, SMALL: 0 }
};

app.post("/api/play/aviator", auth, async (req, res) => {
    try {
        const { betAmount, cashOutMultiplier } = req.body;
        const userId = req.user.id;

        if (!betAmount || betAmount <= 0) {
            return res.json({ success: false, message: "Invalid bet amount" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(500).json({ success: false, message: "User not found" });
        }

        if (user.coins < betAmount) {
            return res.json({ success: false, message: "Insufficient coins" });
        }

        // Logic for admin player (simplified for MongoDB)
        const isAdminPlayer = false; // You can adjust this based on admin criteria

        const gameResult = playAviator(Number(betAmount), Number(cashOutMultiplier), isAdminPlayer);
        const winAmount = gameResult.winAmount;
        const netChange = winAmount - betAmount;

        user.coins += netChange;
        await user.save();

        // Update Admin Wallet with Profit
        const adminProfit = -netChange;
        await Admin.findOneAndUpdate({}, { $inc: { balance: adminProfit } });

        // Log Transaction
        const txn = new Transaction({
            user_id: userId,
            amount: netChange,
            type: "game_aviator",
            details: `Cashed out at ${gameResult.cashOutAt}x`
        });
        await txn.save();

        res.json({
            success: true,
            ...gameResult,
            newBalance: user.coins
        });
    } catch (error) {
        console.error("Aviator Play Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post("/api/play/bigsmall", auth, async (req, res) => {
    try {
        const { betAmount, prediction } = req.body;
        const userId = req.user.id;

        if (!betAmount || betAmount <= 0) {
            return res.json({ success: false, message: "Invalid bet amount" });
        }
        if (!['BIG', 'SMALL'].includes(prediction.toUpperCase())) {
            return res.json({ success: false, message: "Invalid prediction" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(500).json({ success: false, message: "User not found" });
        }

        if (user.coins < betAmount) {
            return res.json({ success: false, message: "Insufficient coins" });
        }

        // Track active bet for admin live view
        activeBets.bigsmall[prediction.toUpperCase()] += Number(betAmount);

        const gameResult = playBigSmall(Number(betAmount), prediction, forcedBigSmallResult);
        const winAmount = gameResult.winAmount;
        const netChange = winAmount - betAmount;

        user.coins += netChange;
        await user.save();

        // Update Admin Wallet with Profit
        const adminProfit = -netChange;
        await Admin.findOneAndUpdate({}, { $inc: { balance: adminProfit } });

        // Log Transaction
        const txn = new Transaction({
            user_id: userId,
            amount: netChange,
            type: "game_bigsmall",
            details: `Predicted ${prediction}, Result: ${gameResult.total}`
        });
        await txn.save();

        // Reset tracking after game (this is simplified, ideally tracked per round)
        setTimeout(() => {
            activeBets.bigsmall[prediction.toUpperCase()] -= Number(betAmount);
            if (activeBets.bigsmall[prediction.toUpperCase()] < 0) activeBets.bigsmall[prediction.toUpperCase()] = 0;
        }, 2000);

        res.json({
            success: true,
            ...gameResult,
            newBalance: user.coins
        });
    } catch (error) {
        console.error("BigSmall Play Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
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
        const stats = { forcedBigSmallResult };

        const totalUsers = await User.countDocuments({});
        const totalCoinsAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]);
        stats.totalUsers = totalUsers;
        stats.totalCoins = totalCoinsAgg.length > 0 ? totalCoinsAgg[0].total : 0;

        // Use live active bets instead of history for real-time monitoring
        stats.betVolumes = {
            BIG: activeBets.bigsmall.BIG,
            SMALL: activeBets.bigsmall.SMALL
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
    const { game, result, tableId, multiplier } = req.body;
    if (game === 'bigsmall') {
        forcedBigSmallResult = result;
        return res.json({ success: true, message: `Next BIG/SMALL result set to: ${result || 'Random'}` });
    } else if (game === 'aviator') {
        setForcedMultiplier(multiplier);
        return res.json({ success: true, message: `Next Aviator crash set to: ${multiplier}x` });
    } else if (game === 'teenpatti') {
        teenPattiManager.forceResult(tableId, result);
        return res.json({ success: true, message: `Table ${tableId} forced result set to: ${result}` });
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

app.post("/api/admin/deposits/:id/approve", adminAuth, async (req, res) => {
    try {
        const depositId = req.params.id;
        const deposit = await DepositRequest.findById(depositId);
        if (!deposit || deposit.status !== 'pending') {
            return res.status(500).json({ success: false, message: "Request not found" });
        }

        if (deposit.payment_method === "withdraw") {
            deposit.status = 'approved';
            await deposit.save();
            res.json({ success: true, message: "Withdrawal request approved" });
        } else {
            await User.findByIdAndUpdate(deposit.user_id, { $inc: { coins: deposit.amount } });
            deposit.status = 'approved';
            await deposit.save();
            res.json({ success: true, message: "Deposit approved" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Error processing request" });
    }
});

app.post("/api/admin/deposits/:id/reject", adminAuth, async (req, res) => {
    try {
        await DepositRequest.findByIdAndUpdate(req.params.id, { status: "rejected" });
        res.json({ success: true, message: "Request rejected" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to reject request" });
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