const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const db = require("./db");
const auth = require("./middleware/auth");
const { playAviator } = require("./games/aviator");
const { playBigSmall } = require("./games/bigsmall");
const { playTeenPatti, evaluateHand } = require("./games/teenpatti");
const teenPattiManager = require("./games/teenPattiManager");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Ensure uploads directory exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Ensure Admin Balance Column and last_bonus Column Exists
db.query("ALTER TABLE admins ADD COLUMN IF NOT EXISTS balance BIGINT DEFAULT 0", (err) => {
    if(err) console.log("Admin balance column already exists or error adding it.");
});

db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bonus TIMESTAMP NULL DEFAULT NULL", (err) => {
    if(err) console.log("last_bonus column already exists or error adding it.");
});

const SECRET = process.env.JWT_SECRET || "solo_secret_key";
const DEFAULT_UPI = process.env.DEFAULT_UPI || "954870514001@ybl";

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

app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.json({ success: false, message: "All fields required" });
        }

        const hash = await bcrypt.hash(password, 10);
        db.query(
            "INSERT INTO users(name,email,password) VALUES(?,?,?)",
            [name, email, hash],
            (err) => {
                if (err) {
                    console.error("Register Error:", err);
                    return res.json({ success: false, message: "Email Already Exists or Database Error" });
                }
                res.json({ success: true, message: "Registration Successful" });
            }
        );
    } catch (error) {
        console.error("Server Register Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    console.log(`User login attempt: ${email}`);
    db.query("SELECT * FROM users WHERE email=?", [email], async (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        if (!result || result.length === 0) {
            return res.json({ success: false, message: "User Not Found" });
        }

        const user = result[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.json({ success: false, message: "Wrong Password" });
        }

        const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: "7d" });
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, coins: user.coins } });
    });
});

app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    console.log(`Admin login attempt: ${username}`);
    db.query("SELECT * FROM admins WHERE username=?", [username], async (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        if (!result || result.length === 0) {
            return res.json({ success: false, message: "Admin Not Found" });
        }

        const admin = result[0];
        const match = await bcrypt.compare(password, admin.password);
        if (!match) {
            return res.json({ success: false, message: "Wrong Password" });
        }

        const token = jwt.sign({ adminId: admin.id, role: "admin" }, SECRET, { expiresIn: "7d" });
        res.json({ success: true, token });
    });
});

app.get("/api/profile", auth, (req, res) => {
    console.log(`Fetching profile for user ID: ${req.user.id}`);
    db.query("SELECT id,name,email,coins,avatar FROM users WHERE id=?", [req.user.id], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        if (!result.length) {
            return res.json({ success: false, message: "User Not Found" });
        }
        res.json({ success: true, user: result[0] });
    });
});

app.post("/api/update-profile", auth, (req, res) => {
    const { name } = req.body;
    db.query("UPDATE users SET name=? WHERE id=?", [name, req.user.id], (err) => {
        if (err) {
            return res.json({ success: false });
        }
        res.json({ success: true, message: "Profile Updated" });
    });
});

app.post("/api/change-password", auth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    db.query("SELECT * FROM users WHERE id=?", [req.user.id], async (err, result) => {
        if (err || !result.length) {
            return res.json({ success: false, message: "User Not Found" });
        }
        const user = result[0];
        const match = await bcrypt.compare(oldPassword, user.password);
        if (!match) {
            return res.json({ success: false, message: "Old Password Wrong" });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        db.query("UPDATE users SET password=? WHERE id=?", [hash, req.user.id], (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database Error" });
            }
            res.json({ success: true, message: "Password Changed" });
        });
    });
});

app.get("/api/leaderboard", (req, res) => {
    db.query("SELECT name,coins FROM users ORDER BY coins DESC LIMIT 20", (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        res.json(result);
    });
});

app.get("/api/wallet", auth, (req, res) => {
    db.query("SELECT coins FROM users WHERE id=?", [req.user.id], (err, result) => {
        if (err || !result.length) {
            return res.status(500).json({ success: false, message: "Unable to load wallet" });
        }
        res.json({ success: true, balance: result[0].coins, upiId: DEFAULT_UPI });
    });
});

app.get("/api/wallet/transactions", auth, (req, res) => {
    db.query("SELECT * FROM deposit_requests WHERE user_id=? ORDER BY id DESC", [req.user.id], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Unable to load requests" });
        }
        res.json({ success: true, transactions: result });
    });
});

app.post("/api/wallet/request-deposit", auth, (req, res) => {
    const { amount, paymentMethod, upiId, reference } = req.body;
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
        return res.json({ success: false, message: "Enter a valid amount" });
    }

    const method = paymentMethod === "qr" ? "qr" : "upi";
    const details = method === "qr"
        ? `Scan QR and pay ${parsedAmount} INR to ${DEFAULT_UPI}`
        : `Send ${parsedAmount} INR to ${upiId || DEFAULT_UPI}${reference ? ` | Ref: ${reference}` : ""}`;

    db.query(
        "INSERT INTO deposit_requests(user_id,amount,payment_method,details) VALUES(?,?,?,?)",
        [req.user.id, parsedAmount, method, details],
        (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Unable to submit request" });
            }
            res.json({ success: true, message: "Deposit request submitted" });
        }
    );
});

app.post("/api/wallet/request-withdrawal", auth, (req, res) => {
    const { amount, upiId, note } = req.body;
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
        return res.json({ success: false, message: "Enter a valid amount" });
    }
    if (!upiId) {
        return res.json({ success: false, message: "Provide a withdrawal UPI ID" });
    }

    const details = `Withdraw ${parsedAmount} INR to ${upiId}${note ? ` | Note: ${note}` : ""}`;
    db.query(
        "INSERT INTO deposit_requests(user_id,amount,payment_method,details) VALUES(?,?,?,?)",
        [req.user.id, parsedAmount, "withdraw", details],
        (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Unable to submit withdrawal request" });
            }
            res.json({ success: true, message: "Withdrawal request submitted" });
        }
    );
});

let forcedBigSmallResult = null; // Global control for Admin

app.post("/api/play/aviator", auth, (req, res) => {
    const { betAmount, cashOutMultiplier } = req.body;
    const userId = req.user.id;

    if (!betAmount || betAmount <= 0) {
        return res.json({ success: false, message: "Invalid bet amount" });
    }

    db.query("SELECT coins FROM users WHERE id=?", [userId], (err, result) => {
        if (err || !result.length) {
            return res.status(500).json({ success: false, message: "User not found" });
        }

        const balance = result[0].coins;
        if (balance < betAmount) {
            return res.json({ success: false, message: "Insufficient coins" });
        }

        const isAdminPlayer = (userId === 1); // Considering user ID 1 is Admin
        const gameResult = playAviator(Number(betAmount), Number(cashOutMultiplier), isAdminPlayer);
        const newBalance = balance - betAmount + gameResult.winAmount;
        const adminProfit = betAmount - gameResult.winAmount;

        db.query("UPDATE users SET coins=? WHERE id=?", [newBalance, userId], (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Error updating balance" });
            }

            // Update Admin Wallet with Profit
            db.query("UPDATE admins SET balance = balance + ? WHERE id = 1", [adminProfit]);

            // Log Transaction
            db.query("INSERT INTO transactions(user_id, amount, type, details) VALUES(?,?,?,?)",
                [userId, gameResult.winAmount - betAmount, 'game_aviator', `Cashed out at ${gameResult.cashOutAt}x`]);

            res.json({
                success: true,
                ...gameResult,
                newBalance
            });
        });
    });
});

app.post("/api/play/bigsmall", auth, (req, res) => {
    const { betAmount, prediction } = req.body;
    const userId = req.user.id;

    if (!betAmount || betAmount <= 0) {
        return res.json({ success: false, message: "Invalid bet amount" });
    }
    if (!['BIG', 'SMALL'].includes(prediction.toUpperCase())) {
        return res.json({ success: false, message: "Invalid prediction" });
    }

    db.query("SELECT coins FROM users WHERE id=?", [userId], (err, result) => {
        if (err || !result.length) {
            return res.status(500).json({ success: false, message: "User not found" });
        }

        const balance = result[0].coins;
        if (balance < betAmount) {
            return res.json({ success: false, message: "Insufficient coins" });
        }

        const gameResult = playBigSmall(Number(betAmount), prediction, forcedBigSmallResult);
        const newBalance = balance - betAmount + gameResult.winAmount;
        const adminProfit = betAmount - gameResult.winAmount;

        db.query("UPDATE users SET coins=? WHERE id=?", [newBalance, userId], (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Error updating balance" });
            }

            // Update Admin Wallet with Profit
            db.query("UPDATE admins SET balance = balance + ? WHERE id = 1", [adminProfit]);

            // Log Transaction
            db.query("INSERT INTO transactions(user_id, amount, type, details) VALUES(?,?,?,?)",
                [userId, gameResult.winAmount - betAmount, 'game_bigsmall', `Predicted ${prediction}, Result: ${gameResult.total}`]);

            res.json({
                success: true,
                ...gameResult,
                newBalance
            });
        });
    });
});

app.post("/api/play/teenpatti", auth, (req, res) => {
    // Legacy endpoint for single player (redirect to multiplayer Table 1 for now or keep separate)
    // For this task, we want multiplayer, so let's focus on the new endpoints.
    res.status(400).json({ success: false, message: "Please use multiplayer tables" });
});

// Multiplayer Teen Patti Endpoints
app.get("/api/teenpatti/tables", auth, (req, res) => {
    res.json({ success: true, tables: teenPattiManager.getTables() });
});

app.post("/api/teenpatti/bet", auth, (req, res) => {
    const { tableId, betAmount } = req.body;
    const userId = req.user.id;

    db.query("SELECT name, coins FROM users WHERE id=?", [userId], (err, result) => {
        if (err || !result.length) return res.status(500).json({ success: false, message: "User not found" });

        const user = result[0];
        if (user.coins < betAmount) return res.json({ success: false, message: "Insufficient coins" });

        const betRes = teenPattiManager.placeBet(tableId, userId, user.name, betAmount);
        if (betRes.success) {
            db.query("UPDATE users SET coins = coins - ? WHERE id=?", [betAmount, userId]);
            res.json({ success: true, message: "Bet placed successfully" });
        } else {
            res.json(betRes);
        }
    });
});

// Resolving bets (This should ideally be a separate process or handled in the manager,
// but for simplicity we can have a check or the manager updates DB)
// Let's modify teenPattiManager to update DB on resolve.

app.get("/api/admin/stats", adminAuth, (req, res) => {
    const stats = { forcedBigSmallResult };
    db.query("SELECT COUNT(*) as totalUsers, SUM(coins) as totalCoins FROM users", (err, result) => {
        if (err) return res.status(500).json({ success: false });
        stats.totalUsers = result[0].totalUsers;
        stats.totalCoins = result[0].totalCoins;

        // Fetch betting volume for last 1 minute
        const oneMinAgo = new Date(Date.now() - 60000);
        db.query("SELECT details, amount FROM transactions WHERE type='game_bigsmall' AND created_at > ?", [oneMinAgo], (err, txns) => {
            let bigVol = 0;
            let smallVol = 0;
            if (txns) {
                txns.forEach(t => {
                    if (t.details.includes('Predicted BIG')) bigVol += Math.abs(t.amount);
                    if (t.details.includes('Predicted SMALL')) smallVol += Math.abs(t.amount);
                });
            }
            stats.betVolumes = { BIG: bigVol, SMALL: smallVol };

            db.query("SELECT balance as adminWalletBalance FROM admins WHERE id = 1", (err, result) => {
                stats.adminWalletBalance = (result && result.length > 0) ? result[0].adminWalletBalance : 0;

                db.query("SELECT COUNT(*) as pendingDeposits FROM deposit_requests WHERE status='pending' AND payment_method != 'withdraw'", (err, result) => {
                    stats.pendingDeposits = result ? result[0].pendingDeposits : 0;

                    db.query("SELECT COUNT(*) as pendingWithdrawals FROM deposit_requests WHERE status='pending' AND payment_method = 'withdraw'", (err, result) => {
                        stats.pendingWithdrawals = result ? result[0].pendingWithdrawals : 0;
                        res.json({ success: true, stats });
                    });
                });
            });
        });
    });
});

app.post("/api/admin/force-result", adminAuth, (req, res) => {
    const { game, result, tableId, multiplier } = req.body;
    if (game === 'bigsmall') {
        forcedBigSmallResult = result; // 'BIG', 'SMALL', or null (Random)
        return res.json({ success: true, message: `Next BIG/SMALL result set to: ${result || 'Random'}` });
    } else if (game === 'aviator') {
        // We'll need to update aviator.js to handle a global forced result
        const aviator = require("./games/aviator");
        aviator.setForcedMultiplier(multiplier);
        return res.json({ success: true, message: `Next Aviator crash set to: ${multiplier}x` });
    } else if (game === 'teenpatti') {
        teenPattiManager.forceResult(tableId, result);
        return res.json({ success: true, message: `Table ${tableId} forced result set to: ${result}` });
    }
    res.json({ success: false, message: "Invalid game" });
});

app.get("/api/admin/game-logs", adminAuth, (req, res) => {
    db.query(
        "SELECT transactions.*, users.name, users.email FROM transactions JOIN users ON users.id = transactions.user_id WHERE type LIKE 'game_%' ORDER BY id DESC LIMIT 50",
        (err, result) => {
            if (err) return res.status(500).json({ success: false });
            res.json(result);
        }
    );
});

app.post("/api/admin/delete-user", adminAuth, (req, res) => {
    const { userId } = req.body;
    db.query("DELETE FROM users WHERE id=?", [userId], (err) => {
        if (err) return res.json({ success: false, message: "Error deleting user" });
        res.json({ success: true, message: "User Deleted Successfully" });
    });
});

app.get("/api/admin/users", adminAuth, (req, res) => {
    db.query("SELECT id,name,email,coins,status FROM users ORDER BY id DESC", (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        res.json(result);
    });
});

app.get("/api/admin/user/:id", adminAuth, (req, res) => {
    db.query("SELECT id,name,email,coins FROM users WHERE id=?", [req.params.id], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database Error" });
        }
        res.json(result[0]);
    });
});

app.get("/api/admin/search-user/:keyword", adminAuth, (req, res) => {
    const keyword = `%${req.params.keyword}%`;
    db.query(
        "SELECT id,name,email,coins,status FROM users WHERE name LIKE ? OR email LIKE ?",
        [keyword, keyword],
        (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database Error" });
            }
            res.json(result);
        }
    );
});

app.post("/api/admin/block-user", adminAuth, (req, res) => {
    const { userId } = req.body;
    db.query("UPDATE users SET status='blocked' WHERE id=?", [userId], (err) => {
        if (err) {
            return res.json({ success: false });
        }
        res.json({ success: true, message: "User Blocked" });
    });
});

app.post("/api/admin/unblock-user", adminAuth, (req, res) => {
    const { userId } = req.body;
    db.query("UPDATE users SET status='active' WHERE id=?", [userId], (err) => {
        if (err) {
            return res.json({ success: false });
        }
        res.json({ success: true, message: "User Activated" });
    });
});

app.get("/api/admin/deposits", adminAuth, (req, res) => {
    db.query(
        "SELECT deposit_requests.*, users.name, users.email FROM deposit_requests JOIN users ON users.id=deposit_requests.user_id ORDER BY deposit_requests.id DESC",
        (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Unable to load deposit requests" });
            }
            res.json(result);
        }
    );
});

app.post("/api/admin/deposits/:id/approve", adminAuth, (req, res) => {
    const depositId = req.params.id;
    db.query("SELECT * FROM deposit_requests WHERE id=? AND status='pending'", [depositId], (err, result) => {
        if (err || !result.length) {
            return res.status(500).json({ success: false, message: "Request not found" });
        }

        const deposit = result[0];
        if (deposit.payment_method === "withdraw") {
            db.query("UPDATE deposit_requests SET status='approved' WHERE id=?", [depositId], (err) => {
                if (err) {
                    return res.status(500).json({ success: false, message: "Unable to update request" });
                }
                res.json({ success: true, message: "Withdrawal request approved" });
            });
        } else {
            db.query("UPDATE users SET coins = coins + ? WHERE id=?", [deposit.amount, deposit.user_id], (err) => {
                if (err) {
                    return res.status(500).json({ success: false, message: "Unable to update user balance" });
                }
                db.query("UPDATE deposit_requests SET status='approved' WHERE id=?", [depositId], (err) => {
                    if (err) {
                        return res.status(500).json({ success: false, message: "Unable to update request" });
                    }
                    res.json({ success: true, message: "Deposit approved" });
                });
            });
        }
    });
});

app.post("/api/admin/deposits/:id/reject", adminAuth, (req, res) => {
    const depositId = req.params.id;
    db.query("UPDATE deposit_requests SET status='rejected' WHERE id=?", [depositId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Unable to reject request" });
        }
        res.json({ success: true, message: "Request rejected" });
    });
});

app.post("/api/admin/update-coins", adminAuth, (req, res) => {
    const { userId, coins } = req.body;
    db.query("UPDATE users SET coins=? WHERE id=?", [coins, userId], (err) => {
        if (err) {
            return res.json({ success: false });
        }
        res.json({ success: true, message: "Coins Updated" });
    });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    },
});

const upload = multer({ storage });

app.post("/api/upload-avatar", auth, upload.single("avatar"), (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: "No file uploaded" });
    }
    const avatar = req.file.filename;
    db.query("UPDATE users SET avatar=? WHERE id=?", [avatar, req.user.id], (err) => {
        if (err) {
            console.error("Database error during avatar update:", err);
            return res.json({ success: false, message: "Database error" });
        }
        res.json({ success: true, avatar });
    });
});

app.post("/api/daily-bonus", auth, (req, res) => {
    db.query("SELECT last_bonus FROM users WHERE id=?", [req.user.id], (err, result) => {
        if (err || !result.length) {
            return res.status(500).json({ success: false, message: "Unable to load bonus status" });
        }

        const lastBonus = result[0].last_bonus;
        const now = new Date();

        if (lastBonus) {
            const lastDate = new Date(lastBonus).toDateString();
            const today = now.toDateString();
            if (lastDate === today) {
                return res.json({ success: false, message: "Already claimed today! Come back tomorrow." });
            }
        }

        const bonusAmount = 120;
        db.query("UPDATE users SET coins=coins+?, last_bonus=? WHERE id=?", [bonusAmount, now, req.user.id], (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Unable to add bonus" });
            }
            res.json({ success: true, message: `+${bonusAmount} Coins Added!` });
        });
    });
});

app.get("/", (req, res) => {
    res.json({ success: true, message: "Solo Casino Demo API Running" });
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
