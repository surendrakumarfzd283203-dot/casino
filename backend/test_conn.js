const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        ca: fs.readFileSync(path.join(__dirname, "ca.pem")),
        rejectUnauthorized: true
    }
};

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.log("CONN_FAIL");
        console.error(err);
        process.exit(1);
    } else {
        console.log("CONN_SUCCESS");
        db.query("SHOW TABLES", (err, results) => {
            if (err) console.error(err);
            else console.log("TABLES:", results.length);
            db.end();
            process.exit(0);
        });
    }
});
