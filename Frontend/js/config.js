// Dynamically detect the API URL
// If running on port 80/443 (Live or XAMPP), assume backend is on port 5000 for local testing
let API_URL = window.location.origin;

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_URL = window.location.protocol + "//" + window.location.hostname + ":5000";
}

console.log("API_URL set to:", API_URL);
