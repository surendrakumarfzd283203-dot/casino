# MongoDB Atlas Migration Walkthrough

The project has been migrated from a MySQL database to MongoDB Atlas using the Mongoose ODM. This change improves scalability and simplifies the database schema management.

## Changes Made

### 1. Database Connection
- **File**: [db.js](file:///C:/xampp/htdocs/solo__casino/backend/db.js)
- Switched from `mysql2` to `mongoose`.
- The connection is now initialized using `process.env.MONGODB_URI`.

### 2. Data Models
New models were created in the `backend/models/` directory:
- [User.js](file:///C:/xampp/htdocs/solo__casino/backend/models/User.js): Handles user profiles, balances, and authentication.
- [Admin.js](file:///C:/xampp/htdocs/solo__casino/backend/models/Admin.js): Manages admin credentials and wallet balance.
- [Transaction.js](file:///C:/xampp/htdocs/solo__casino/backend/models/Transaction.js): Logs game results and financial activities.
- [DepositRequest.js](file:///C:/xampp/htdocs/solo__casino/backend/models/DepositRequest.js): Tracks deposit and withdrawal requests.

### 3. Backend Refactoring
- [server.js](file:///C:/xampp/htdocs/solo__casino/backend/server.js): All raw SQL queries (`db.query`) have been replaced with Mongoose model methods (`find`, `save`, `findOneAndUpdate`, etc.).
- [teenPattiManager.js](file:///C:/xampp/htdocs/solo__casino/backend/games/teenPattiManager.js): Updated to use Mongoose for resolving game outcomes and updating balances.

### 4. Configuration
- [.env](file:///C:/xampp/htdocs/solo__casino/.env): Added `MONGODB_URI` and removed MySQL-specific variables.

## Verification
- Syntax check passed for all modified files.
- `mongoose` dependency successfully installed.
- `mysql2` dependency removed.

## Post-Migration Steps
1. **Update Password**: Ensure you replace `<PASSWORD>` in `.env` with your actual MongoDB Atlas password.
2. **Start Server**: Run `npm start` to launch the backend.
3. **First Run**: The server will automatically create a default admin user based on your `.env` settings if one doesn't exist.
