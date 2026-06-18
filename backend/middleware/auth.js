require("dotenv").config();
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "solo_secret_key";

module.exports = (req, res, next) => {
    try {
        const token = req.headers.authorization;
        if (!token) {
            console.log("Auth Middleware: Token Missing");
            return res.status(401).json({
                success: false,
                message: "Token Missing"
            });
        }

        const decoded = jwt.verify(token, SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error("Auth Middleware: Invalid Token Error:", error.message);
        return res.status(401).json({
            success: false,
            message: "Invalid Token"
        });
    }
};