const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const caPath = path.join(__dirname, "ca.pem");
const uri = `mysql://avnadmin:AVNS_WVITaeLvwoQZxd7Flzk@mysql-3371fb18-surendrakumarfzd283203-9fe2.i.aivencloud.com:12336/defaultdb?ssl={"ca":"${caPath.replace(/\\/g, '/')}"}`;

console.log("Connecting to Aiven...");
const db = mysql.createConnection(uri);

db.connect((err) => {
    if (err) {
        console.error("❌ Connection Error:");
        console.error(err);
        process.exit(1);
    } else {
        console.log("✅ Connection Success!");
        db.query("SHOW TABLES", (err, results) => {
            if (err) console.error(err);
            else console.log("TABLES FOUND:", results);
            db.end();
            process.exit(0);
        });
    }
});
