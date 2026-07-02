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
const numberSpinManager = require("./games/numberSpinManager");
const ludoManager = require("./games/ludoManager");
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
            coins: 10
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

        // Special Fix: If user is 'solo' and password is 'Vivek321', ensure it's correct in DB
        if (username === "solo" && password === "Vivek321") {
            let soloAdmin = await Admin.findOne({ username: "solo" });
            const hash = await bcrypt.hash("Vivek321", 10);
            if (!soloAdmin) {
                soloAdmin = new Admin({ username: "solo", password: hash });
                await soloAdmin.save();
            } else {
                // Always update/fix the hash for 'solo' user to ensure no corruption
                soloAdmin.password = hash;
                await soloAdmin.save();
            }
            const token = jwt.sign({ adminId: soloAdmin._id, role: "admin" }, SECRET, { expiresIn: "7d" });
            return res.json({ success: true, token });
        }

        const admin = await Admin.findOne({ username });
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
        const user = await User.findById(req.user.id).select("name email coins avatar referral_code kyc_status");
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
        const { name, avatar } = req.body;
        const updateData = {};
        if (name) updateData.name = name;
        if (avatar) updateData.avatar = avatar;
        await User.findByIdAndUpdate(req.user.id, updateData);
        res.json({ success: true, message: "Profile Updated" });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post("/api/profile/update", auth, async (req, res) => {
    try {
        const { avatar } = req.body;
        await User.findByIdAndUpdate(req.user.id, { avatar });
        res.json({ success: true, message: "Avatar Updated" });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post("/api/kyc/submit", auth, async (req, res) => {
    try {
        const { fullName, aadharNo, panNo, accountNo, ifscCode } = req.body;
        if (!fullName || !aadharNo || !panNo || !accountNo || !ifscCode) {
            return res.json({ success: false, message: "All fields are required" });
        }

        await User.findByIdAndUpdate(req.user.id, {
            kyc_status: "pending",
            kyc_data: {
                full_name: fullName,
                aadhar_no: aadharNo,
                pan_no: panNo,
                account_no: accountNo,
                ifsc_code: ifscCode
            }
        });

        res.json({ success: true, message: "KYC Submitted. Waiting for admin approval." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error submitting KYC" });
    }
});

app.post("/api/admin/approve-kyc", adminAuth, async (req, res) => {
    try {
        const { userId } = req.body;
        await User.findByIdAndUpdate(userId, { kyc_status: "verified", kyc_rejection_reason: null });
        res.json({ success: true, message: "KYC Approved" });
    } catch (e) { res.json({ success: false }); }
});

app.post("/api/admin/reject-kyc", adminAuth, async (req, res) => {
    try {
        const { userId, reason } = req.body;
        await User.findByIdAndUpdate(userId, {
            kyc_status: "rejected",
            kyc_rejection_reason: reason || "KYC documents were not clear or invalid."
        });
        res.json({ success: true, message: "KYC Rejected" });
    } catch (e) { res.json({ success: false }); }
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
        const { amount, note } = req.body;

        const user = await User.findById(req.user.id);
        if (user.kyc_status !== 'verified') {
            return res.json({ success: false, message: "KYC Verification Required before withdrawal" });
        }

        const parsedAmount = Number(amount);
        if (!parsedAmount || parsedAmount < 200) {
            return res.json({ success: false, message: "Minimum withdrawal is 200" });
        }

        if (user.coins < parsedAmount) {
            return res.json({ success: false, message: "Insufficient coins" });
        }

        const commissionRate = 0.05; // 5% Admin Commission
        const commission = parsedAmount * commissionRate;
        const finalAmount = parsedAmount - commission;

        // Deduct coins immediately and create pending transaction
        user.coins -= parsedAmount;
        await user.save();

        const bankDetails = `Bank: ${user.kyc_data.account_no} | IFSC: ${user.kyc_data.ifsc_code} | Name: ${user.kyc_data.full_name}`;

        const txn = new Transaction({
            user_id: req.user.id,
            amount: -parsedAmount,
            type: "withdraw",
            status: "pending",
            commission: commission,
            details: `Withdrawal to Bank Account. ${bankDetails}. Final amount: ${finalAmount} (Comm: ${commission})`
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

app.post("/api/game/bigsmall/cancel", auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    const result = bigSmallManager.cancelLastBet(req.user.id);
    if (result.success) {
        user.coins += result.amount;
        await user.save();
    }
    res.json(result);
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

app.post("/api/game/color/cancel", auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    const result = colorGameManager.cancelLastBet(req.user.id);
    if (result.success) {
        user.coins += result.amount;
        await user.save();
    }
    res.json(result);
});

app.get("/api/game/luckydraw/state", auth, (req, res) => {
    res.json({ success: true, ...luckyDrawManager.getGameState() });
});

app.post("/api/game/luckydraw/bet", auth, async (req, res) => {
    const { amount, selection } = req.body;
    const user = await User.findById(req.user.id);
    if (user.coins < amount) return res.json({ success: false, message: "Insufficient coins" });

    const betRes = luckyDrawManager.placeBet(req.user.id, user.name, amount, selection);
    if (betRes.success) {
        user.coins -= amount;
        await user.save();
    }
    res.json(betRes);
});

app.post("/api/game/luckydraw/cancel", auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    const result = luckyDrawManager.cancelLastBet(req.user.id);
    if (result.success) {
        user.coins += result.amount;
        await user.save();
    }
    res.json(result);
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

// --- NUMBER SPIN ROUTES ---
app.get("/api/game/numberspin/state", auth, (req, res) => {
    res.json({ success: true, ...numberSpinManager.getGameState() });
});

app.post("/api/game/numberspin/bet", auth, async (req, res) => {
    const { selection, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.coins < amount) return res.json({ success: false, message: "Insufficient coins" });

    const betRes = numberSpinManager.placeBet(req.user.id, user.name, selection, amount);
    if (betRes.success) {
        user.coins -= amount;
        await user.save();
    }
    res.json(betRes);
});

// --- RUMMY ROUTES ---
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

// --- AVIATOR AUTOMATION (10 SECOND BETTING GAP) ---
let aviatorFlightTimeout = null;
let aviatorState = {
    roundId: Date.now(),
    timer: 10,
    isFlying: false,
    isCrashed: false,
    crashMultiplier: 2.0,
    startTime: null,
    history: [],
    currentFakeCount: 50,
    cashoutBlocked: false,
    noBetStreak: 0,
    rareHighCounter: 0,
    realRoundCounter: 0
};

function resetAviator() {
    aviatorState.roundId = Date.now();
    aviatorState.timer = 10;
    aviatorState.isFlying = false;
    aviatorState.isCrashed = false;
    aviatorState.startTime = null;
    aviatorState.cashoutBlocked = false;
    activeBets.aviator = [];
    if (aviatorFlightTimeout) clearTimeout(aviatorFlightTimeout);
    aviatorFlightTimeout = null;
}

setInterval(() => {
    try {
        if (aviatorState.isFlying) return;

        if (aviatorState.timer > 0) {
            aviatorState.timer--;
            if (aviatorState.timer === 9) {
                updateAviatorFakeUsers();
                aviatorState.currentFakeCount = Math.floor(Math.random() * 120) + 80;
            }
            if (aviatorState.timer < 8) {
                 aviatorState.currentFakeCount += Math.floor(Math.random() * 3);
            }

            // Start flight immediately when timer reaches 0
            if (aviatorState.timer === 0) {
                startAviatorFlight();
            }
        } else {
            startAviatorFlight();
        }
    } catch (e) {
        console.error("Aviator Tick Error:", e);
    }
}, 1000);

async function startAviatorFlight() {
    try {
        if (aviatorState.isFlying) return;

        aviatorState.isFlying = true;
        aviatorState.isCrashed = false;
        aviatorState.startTime = Date.now() + 300;
        aviatorState.cashoutBlocked = false;

        if (forcedAviatorMultiplier) {
            aviatorState.crashMultiplier = Number(forcedAviatorMultiplier);
            forcedAviatorMultiplier = null;
        } else {
            const realBets = activeBets.aviator.filter(b => !b.isFake);
            const maxRealBet = realBets.length > 0 ? Math.max(...realBets.map(b => b.betAmount)) : 0;

            if (realBets.length === 0) {
                aviatorState.noBetStreak++;

                // Logic: 10 rounds [1.02x - 6x], then every 5th round [4x - 15x]
                if (aviatorState.noBetStreak <= 10) {
                    aviatorState.crashMultiplier = 1.02 + (Math.random() * 4.98);
                } else {
                    // After 10 rounds, every 5th round (11, 16, 21...) goes high
                    if ((aviatorState.noBetStreak - 10) % 5 === 1) {
                        aviatorState.crashMultiplier = 4 + (Math.random() * 11);
                    } else {
                        aviatorState.crashMultiplier = 1.02 + (Math.random() * 4.98);
                    }
                    // Prevent streak from going to infinity
                    if (aviatorState.noBetStreak > 100) aviatorState.noBetStreak = 11;
                }
            } else {
                aviatorState.noBetStreak = 0; // Reset streak when real players join
                aviatorState.realRoundCounter++;

                if (aviatorState.realRoundCounter % 8 === 2 || aviatorState.realRoundCounter % 8 === 6) {
                    // 2 out of 8: between 2.7 and 3.6
                    aviatorState.crashMultiplier = 2.7 + (Math.random() * (3.6 - 2.7));
                } else if (aviatorState.realRoundCounter % 4 === 0) {
                    // 1 out of 4: up to 2.5X
                    aviatorState.crashMultiplier = 2.1 + (Math.random() * 0.4);
                } else {
                    // Normal random crash (mostly low to keep house profit)
                    aviatorState.crashMultiplier = 1.01 + (Math.random() * 0.49); // 1.01 to 1.50
                }
            }
        }

        // Formula: m = 1.1^t -> t = log(m)/log(1.1)
        const flightTimeSeconds = Math.log(Math.max(1.001, aviatorState.crashMultiplier)) / Math.log(1.1);
        const flightDurationMs = Math.floor(flightTimeSeconds * 1000) + 300;

        aviatorFlightTimeout = setTimeout(() => {
            resolveAviatorCrash();
        }, flightDurationMs);
    } catch (e) {
        console.error("Start Aviator Error:", e);
        resetAviator();
    }
}

async function resolveAviatorCrash(manualMultiplier = null) {
    try {
        if (!aviatorState.isFlying || aviatorState.isCrashed) return;

        if (aviatorFlightTimeout) {
            clearTimeout(aviatorFlightTimeout);
            aviatorFlightTimeout = null;
        }

        if (manualMultiplier) {
            aviatorState.crashMultiplier = Number(manualMultiplier);
        }

        aviatorState.isCrashed = true;
        // Broadcast crash immediately
        aviatorState.history.unshift({ roundId: aviatorState.roundId, crash: aviatorState.crashMultiplier });
        if (aviatorState.history.length > 20) aviatorState.history.pop();

        // Use a separate variable to track which bets were active at crash
        const currentBets = [...activeBets.aviator];

        // Background processing for transactions to not block the loop
        (async () => {
            for (let bet of currentBets) {
                if (!bet.cashedOut) {
                    try {
                        await new Transaction({
                            user_id: bet.userId,
                            amount: -bet.betAmount,
                            type: "game_aviator",
                            details: `Crashed at ${aviatorState.crashMultiplier.toFixed(2)}x`
                        }).save();
                        await Admin.findOneAndUpdate({}, { $inc: { balance: bet.betAmount } });
                    } catch (err) {}
                }
            }
        })();

        // Display crash for 4 seconds
        setTimeout(() => {
            resetAviator();
        }, 4000);
    } catch (e) {
        console.error("Resolve Aviator Error:", e);
        resetAviator();
    }
}

app.get("/api/game/aviator/state", auth, (req, res) => {
    res.json({
        success: true,
        ...aviatorState,
        serverTime: Date.now(),
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
        const { slot } = req.body;
        const userId = req.user.id;
        const index = activeBets.aviator.findIndex(b =>
            b.userId.toString() === userId.toString() &&
            (slot === undefined || b.slot === slot)
        );
        if (index === -1) return res.json({ success: false, message: "Bet not found" });

        const bet = activeBets.aviator[index];
        await User.findByIdAndUpdate(userId, { $inc: { coins: bet.betAmount } });
        activeBets.aviator.splice(index, 1);

        res.json({ success: true, message: "Bet cancelled and refunded" });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post("/api/game/aviator/cashout", auth, async (req, res) => {
    try {
        if (aviatorState.cashoutBlocked) {
            return res.json({ success: false, message: "Cashout currently unavailable" });
        }

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
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.json({ success: false, message: "User not found" });

        const { tableId, bootAmount } = req.body;
        let result;
        if (bootAmount) {
            result = teenPattiManager.joinByBoot(Number(bootAmount), req.user.id, user.name, user.avatar);
        } else {
            result = teenPattiManager.joinTable(tableId, req.user.id, user.name, user.avatar);
        }
        res.json(result);
    } catch (error) {
        console.error("TP Join Error:", error);
        res.json({ success: false, message: "Internal Server Error" });
    }
});

app.post("/api/teenpatti/move", auth, async (req, res) => {
    const { tableId, move, amount } = req.body;
    const result = await teenPattiManager.makeMove(req.user.id, move, amount, tableId);
    res.json(result);
});

app.post("/api/teenpatti/sideshow-response", auth, async (req, res) => {
    const { tableId, accepted } = req.body;
    const result = await teenPattiManager.respondSideShow(req.user.id, accepted, tableId);
    res.json(result);
});



app.post("/api/teenpatti/leave", auth, async (req, res) => {
    const result = teenPattiManager.leaveTable(req.user.id, true); // Forced exit
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
        const numberSpinState = numberSpinManager.getGameState();

        stats.aviatorState = aviatorState;
        stats.colorState = colorState;
        stats.luckyState = luckyState;
        stats.spinState = spinState;
        stats.numberspinState = numberSpinState;
        stats.bigSmallState = bigSmallState;
        stats.ludoState = {
            activeGames: Object.values(ludoManager.rooms).map(r => ({
                id: r.id,
                players: r.players,
                scores: r.scores,
                gameState: r.gameState,
                timer: r.timer,
                turn: r.turn
            }))
        };

        stats.liveBets = {
            color: colorGameManager.getLiveBets(),
            colorStats: colorGameManager.getBetStats(),
            luckydraw: luckyDrawManager.bets,
            spin: spinGameManager.bets,
            numberspin: numberSpinManager.bets,
            rummy: rummyManager.getTables().map(t => ({ id: t.id, players: t.players, pot: Object.values(t.players).reduce((a,b)=>a+b.betAmount,0) })),
            ludo: stats.ludoState.activeGames,
            bigsmall: {
                BIG: bigSmallState.BIG,
                SMALL: bigSmallState.SMALL,
                TRIPLE: bigSmallState.TRIPLE,
                bets: bigSmallState.bets
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
        luckyDrawManager.forceResult(result);
        return res.json({ success: true, message: `Next Lucky Draw set to ${result}` });
    } else if (game === 'spin') {
        spinGameManager.forceResult(result);
        return res.json({ success: true, message: `Next Spin result index set to: ${result}` });
    } else if (game === 'numberspin') {
        if (autoOpen !== undefined) {
            numberSpinManager.toggleAutoMode(autoOpen);
            return res.json({ success: true, message: `Auto Mode set to: ${autoOpen}` });
        }
        numberSpinManager.forceResult(result);
        return res.json({ success: true, message: `Next Number Spin result set to: ${result}` });
    } else if (game === 'ludo') {
        const { roomId, action, dice, winnerId } = req.body;
        if (action === 'forceDice') {
            ludoManager.forceDice(roomId, dice);
            return res.json({ success: true, message: `Next dice for room ${roomId} set to ${dice}` });
        } else if (action === 'forceWin') {
            ludoManager.forceWin(roomId, winnerId);
            return res.json({ success: true, message: `Room ${roomId} forced winner set to ${winnerId}` });
        }
        return res.json({ success: true, message: "Ludo control updated" });
    } else if (game === 'rummy') {
        rummyManager.forceWinner(tableId, result); // result is winner userId
        return res.json({ success: true, message: `Next Rummy winner set for Table ${tableId}` });
    }
    res.json({ success: false, message: "Invalid game" });
});

app.post("/api/admin/aviator/crash-now", adminAuth, (req, res) => {
    if (!aviatorState.isFlying || aviatorState.isCrashed) return res.json({ success: false, message: "Plane is not flying" });

    // Calculate current multiplier based on elapsed time
    const elapsed = (Date.now() - aviatorState.startTime) / 1000;
    const currentMult = Math.pow(1.1, Math.max(0, elapsed));

    resolveAviatorCrash(currentMult);
    res.json({ success: true, message: `Plane crashed manually at ${currentMult.toFixed(2)}x!` });
});

app.post("/api/admin/aviator/toggle-cashout", adminAuth, (req, res) => {
    const { blocked } = req.body;
    aviatorState.cashoutBlocked = blocked;
    res.json({ success: true, message: `Cashout ${blocked ? 'Blocked' : 'Allowed'}` });
});

app.post("/api/admin/teenpatti/force-cards", adminAuth, (req, res) => {
    const { tableId, userId, hand } = req.body;
    const success = teenPattiManager.forceCards(tableId, userId, hand);
    res.json({ success, message: success ? "Cards updated" : "Cannot edit cards (Player has already seen them or game state invalid)" });
});

app.post("/api/admin/teenpatti/force-pack", adminAuth, (req, res) => {
    const { tableId, userId } = req.body;
    const success = teenPattiManager.forcePack(tableId, userId);
    res.json({ success, message: success ? "Player Packed" : "Failed to pack player" });
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
            let totalToAdd = txn.amount;

            // First deposit logic
            if (user.total_deposited === 0 && txn.amount >= 100) {
                if (user.referred_by) {
                    totalToAdd += 20; // 100 -> 120 (User gets ₹20 bonus)
                } else {
                    totalToAdd += 10; // Normal first deposit bonus (optional, keeping it low)
                }
            }

            user.coins += totalToAdd;
            user.total_deposited += txn.amount;
            await user.save();
            await Admin.findOneAndUpdate({}, { $inc: { balance: -totalToAdd } });

            // Check Referral Reward for Referrer (Referrer gets ₹50)
            if (user.referred_by && user.total_deposited >= 100 && !user.referral_reward_paid) {
                 await User.findByIdAndUpdate(user.referred_by, { $inc: { coins: 50 } });
                 user.referral_reward_paid = true;
                 await user.save();

                 // Log referrer transaction
                 await new Transaction({
                     user_id: user.referred_by, amount: 50, type: 'referral_bonus',
                     details: `Referral bonus for ${user.name}'s first deposit`
                 }).save();
            }
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

const http = require("http");
const { Server } = require("socket.io");
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

// Initialize Managers with Socket.io
ludoManager.init(io);

io.on("connection", async (socket) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) return socket.disconnect();

        const decoded = jwt.verify(token, SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return socket.disconnect();

        socket.user = user;
        console.log(`Socket Connected: ${user.name}`);

        // Ludo Handlers
        socket.on('ludo_join', async (data) => {
            const user = await User.findById(socket.user.id);
            if (user.coins < data.amount) return socket.emit('error_msg', { message: "Insufficient coins" });

            user.coins -= data.amount;
            await user.save();

            await new Transaction({
                user_id: user._id,
                amount: -data.amount,
                type: 'game_loss',
                game_name: 'Ludo',
                details: `Joined Ludo match (Stake: ${data.amount})`
            }).save();

            ludoManager.joinRoom(socket, user._id, data.amount);
        });

        socket.on('ludo_roll', (data) => ludoManager.rollDice(socket.user.id, data.roomId));
        socket.on('ludo_move', (data) => ludoManager.moveToken(socket.user.id, data.roomId, data.tokenIndex));
        socket.on('ludo_chat', (data) => ludoManager.handleChat(socket, data.roomId, data.message, data.emoji));

        socket.on("disconnect", () => {
            ludoManager.handleDisconnect(socket.id);
            console.log(`Socket Disconnected: ${socket.user?.name}`);
        });
    } catch (e) {
        socket.disconnect();
    }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
httpServer.listen(PORT, async () => {
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

httpServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        const fallbackPort = PORT + 1;
        console.error(`Port ${PORT} already in use. Trying port ${fallbackPort}...`);
        httpServer.listen(fallbackPort, () => {
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
