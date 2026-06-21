const mysql = require("mysql2");
require("dotenv").config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
};

console.log("Connecting with rejectUnauthorized: false...");
const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error("❌ Connection Error:");
        console.error(err);
        process.exit(1);
    } else {
        console.log("✅ Connection Success!");
        db.query("SELECT 1", (err, results) => {
            if (err) console.error(err);
            else console.log("QUERY SUCCESS");
            db.end();
            process.exit(0);
        });
    }
});
