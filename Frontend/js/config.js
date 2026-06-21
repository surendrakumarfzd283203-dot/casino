const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : 'https://casino-vri2.onrender.com';

console.log("API_URL set to:", API_URL);
