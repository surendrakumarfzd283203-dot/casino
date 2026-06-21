const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : 'https://YOUR-APP-NAME.onrender.com/api'; // Replace with your Render URL later

console.log("API_URL set to:", API_URL);
