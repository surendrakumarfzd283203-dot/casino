# Migrate Database to MongoDB Atlas

This plan outlines the steps to migrate the Solo Casino project from a MySQL database to MongoDB Atlas using Mongoose.

## User Review Required

> [!IMPORTANT]
> - You will need to provide your MongoDB Atlas Connection URI in the `.env` file after the migration.
> - I will replace raw MySQL queries with Mongoose model methods.

## Proposed Changes

### Dependencies

#### [package.json](file:///C:/xampp/htdocs/solo__casino/package.json)
- Add `mongoose` dependency.
- Remove `mysql2` (optional, but cleaner).

---

### Backend Core

#### [.env](file:///C:/xampp/htdocs/solo__casino/.env)
- Remove MySQL related variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
- Add `MONGODB_URI`.

#### [db.js](file:///C:/xampp/htdocs/solo__casino/backend/db.js)
- Replace `mysql2` connection logic with `mongoose` connection logic.

#### [NEW] [models/User.js](file:///C:/xampp/htdocs/solo__casino/backend/models/User.js)
- Define schema for users: `name`, `email`, `password`, `coins`, `status`, `avatar`, `last_bonus`, `created_at`.

#### [NEW] [models/Admin.js](file:///C:/xampp/htdocs/solo__casino/backend/models/Admin.js)
- Define schema for admins: `username`, `password`, `balance`.

#### [NEW] [models/Transaction.js](file:///C:/xampp/htdocs/solo__casino/backend/models/Transaction.js)
- Define schema for transactions: `user_id` (ObjectId), `amount`, `type`, `details`, `created_at`.

#### [NEW] [models/DepositRequest.js](file:///C:/xampp/htdocs/solo__casino/backend/models/DepositRequest.js)
- Define schema for deposit requests: `user_id` (ObjectId), `amount`, `payment_method`, `details`, `status`, `created_at`.

---

### Application Logic

#### [server.js](file:///C:/xampp/htdocs/solo__casino/backend/server.js)
- Import Mongoose models.
- Replace all `db.query` calls with Mongoose methods (e.g., `User.findOne`, `User.create`, `User.updateOne`, etc.).
- Update ID handling (MongoDB uses `_id` which is an ObjectId, but often represented as a string).

#### [teenPattiManager.js](file:///C:/xampp/htdocs/solo__casino/backend/games/teenPattiManager.js)
- Update database updates to use Mongoose models.

---

## Verification Plan

### Automated Tests
- I will run the server using `node backend/server.js` and check for connection success.
- I will verify that the schemas are correctly applied in MongoDB Atlas.

### Manual Verification
- Test registration and login flow.
- Test profile updates.
- Test deposit/withdrawal requests.
- Test game results and balance updates.
