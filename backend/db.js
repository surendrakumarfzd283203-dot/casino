const mysql = require("mysql2");
require("dotenv").config();

const dbConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "solo_casino",
    connectTimeout: 10000
};

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error("❌ MySQL Connection Failed");
        console.error(err);
        console.error("Make sure XAMPP MySQL is running and listening on 127.0.0.1:3306.");
    } else {
        console.log("✅ MySQL Connected");
    }
});

module.exports = db;