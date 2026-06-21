const mysql = require("mysql2");
require("dotenv").config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 5000
};

console.log("Connecting WITHOUT SSL...");
const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.log("ERROR RECEIVED:");
        console.log(err.code, err.message);
        process.exit(1);
    } else {
        console.log("Connected? (Should not happen if SSL required)");
        db.end();
        process.exit(0);
    }
});
