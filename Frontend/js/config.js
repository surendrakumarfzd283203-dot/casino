// Dynamically detect the API URL
let API_URL = window.location.origin;

// If we are on local network or localhost, and not already on port 5000
if (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.')) {

    // If accessed via port 80 (standard XAMPP/Apache) or no port specified
    if (!window.location.port || window.location.port === "80" || window.location.port === "8080") {
        API_URL = window.location.protocol + "//" + window.location.hostname + ":5000";
    }
}

console.log("API_URL set to:", API_URL);
