<<<<<<< HEAD
// Dynamically detect the API URL
const API_URL = window.location.origin;
=======
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : 'https://casino-vri2.onrender.com';
>>>>>>> 81ea4e7ca8d02de97a349dedc17379fdd50c9736

console.log("API_URL set to:", API_URL);
