const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        ca: fs.readFileSync(path.join(__dirname, "ca.pem")),
        rejectUnauthorized: true
    },
    multipleStatements: true
};

const db = mysql.createConnection(dbConfig);

const sql = `
CREATE TABLE IF NOT EXISTS users(
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    coins BIGINT DEFAULT 10000,
    status VARCHAR(20) DEFAULT 'active',
    avatar VARCHAR(255) DEFAULT NULL,
    last_bonus TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions(
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    amount BIGINT,
    type VARCHAR(50),
    details VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deposit_requests(
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    amount BIGINT,
    payment_method VARCHAR(20),
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admins(
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255),
    balance BIGINT DEFAULT 0
);

INSERT IGNORE INTO admins(username,password) VALUES
('admin','$2b$10$JCwTu2.rk1h6Ro7G3b2LKujfR52Qrdemgjax1p92wYO9eGWhMypt.');
`;

console.log("Initializing Cloud Database...");
db.connect((err) => {
    if (err) {
        console.error("❌ Connection Failed:", err);
        process.exit(1);
    }
    db.query(sql, (err) => {
        if (err) {
            console.error("❌ Schema Initialization Failed:", err);
        } else {
            console.log("✅ Database Schema Initialized Successfully!");
        }
        db.end();
        process.exit(0);
    });
});
