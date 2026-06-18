# Implementation Plan - Solo Casino "Real Game" & Login Fix

Upgrade the Solo Casino demo to a functional "real game" experience and fix the login redirect issue.

## User Review Required

> [!IMPORTANT]
> - **Login Fix**: I will standardize all API calls to use `http://localhost:5000` and ensure the backend is correctly verifying tokens. The "back to login" issue is likely due to the frontend failing to fetch the profile or an invalid token after login.
> - **Aviator Sync**: I will refactor Aviator so the server generates the crash point *before* the animation starts on the frontend.
> - **Single Server**: I will configure the backend to serve the frontend files directly, which eliminates CORS issues and makes "localhost" settings easier to manage.

## Proposed Changes

### [IMMEDIATE FIX] Login & Server Configuration
The "not moving forward" issue is caused by the backend not serving the frontend files and potential CORS/Token issues.

#### [server.js](file:///C:/Users/Aniket/Downloads/solo%20casino/backend/server.js)
- **Static Hosting**: Add `app.use(express.static(path.join(__dirname, "../Frontend")));` so `localhost:5000` opens the game.
- **SQL Fix**: Replace `ALTER TABLE ... IF NOT EXISTS` (which is not standard) with a safer check or a try-catch block to prevent server startup errors.
- **Route Update**: Remove the JSON response for `/` and serve `index.html`.

#### [login.html](file:///C:/Users/Aniket/Downloads/solo%20casino/Frontend/login.html)
- Change fetch URL to `/api/login` (relative) to ensure it always hits the same server that served the page.
- Add `console.log` for debugging the response.

#### [aviator.js](file:///C:/Users/Aniket/Downloads/solo%20casino/backend/games/aviator.js)
- Refactor to support pre-determined crash points.

---

### Frontend Implementation

#### [user.html](file:///C:/Users/Aniket/Downloads/solo%20casino/Frontend/user.html)
- Complete redesign to match the modern "Solo Casino" theme.
- Add security checks (redirect non-admins).
- Display users in a clean, responsive grid/table.

#### [login.html](file:///C:/Users/Aniket/Downloads/solo%20casino/Frontend/login.html) & [register.html](file:///C:/Users/Aniket/Downloads/solo%20casino/Frontend/register.html)
- Standardize Fetch URLs to `http://localhost:5000/api/...`.
- Add better logging to debug why login might fail or redirect back.

#### [dashboard.html](file:///C:/Users/Aniket/Downloads/solo%20casino/Frontend/dashboard.html) & [profile.html](file:///C:/Users/Aniket/Downloads/solo%20casino/Frontend/profile.html)
- Fix profile fetching logic to handle errors gracefully without immediate redirect if the server is just slow.

#### [aviator.html](file:///C:/Users/Aniket/Downloads/solo%20casino/Frontend/aviator.html)
- Sync animation with the server-provided crash point.

#### [index.html](file:///C:/Users/Aniket/Downloads/solo%20casino/Frontend/index.html)
- Modernize the landing page and add auto-login check.

---

### Database Setup

#### [solo_casino.sql](file:///C:/Users/Aniket/Downloads/solo%20casino/database/solo_casino.sql)
- Verify schema integrity.

## Verification Plan

### Automated Tests
- Run `node backend/server.js` and verify frontend is accessible at `http://localhost:5000`.

### Manual Verification
1.  **Login Test**: Register -> Login -> Verify Dashboard stays open.
2.  **Aviator Test**: Start round -> Verify plane crashes exactly at the multiplier shown.
3.  **Wallet Test**: Submit deposit -> Verify in database.
