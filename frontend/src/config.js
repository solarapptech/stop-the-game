import axios from 'axios';

// Central API URL used across the app. Change here to switch backend.
const API_URL = 'https://stop-the-game-backend.onrender.com/api';

// Apply axios defaults once so other modules don't override or duplicate logic.
axios.defaults.baseURL = API_URL.endsWith('/') ? API_URL : `${API_URL}/`;
axios.defaults.timeout = 10000;

console.log('[config] API_URL =', API_URL, ' axios.baseURL =', axios.defaults.baseURL);

export default API_URL;
