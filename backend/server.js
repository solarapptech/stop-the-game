const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const roomRoutes = require('./routes/room');
const gameRoutes = require('./routes/game');
const paymentRoutes = require('./routes/payment');
const leaderboardRoutes = require('./routes/leaderboard');
const chatRoutes = require('./routes/chat');

// Import socket handlers
const socketHandlers = require('./socket/socketHandlers');

// Import passport config
require('./config/passport');

// Import room cleanup utility
const { startPeriodicCleanup } = require('./utils/roomCleanup');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
// Allow multiple client origins (comma-separated env var CLIENT_URLS or single CLIENT_URL)
const rawClientUrls = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:8081';
const CLIENT_URLS = rawClientUrls.split(',').map(u => u.trim()).filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Always allow configured origins
    if (CLIENT_URLS.includes(origin)) return callback(null, true);

    // In non-production, allow any origin to reduce local-dev friction (especially Expo Web ports)
    if (process.env.NODE_ENV !== 'production') return callback(null, true);

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    credentials: true
  }
});

// Expose io to routes via app instance
app.set('io', io);

// Rate limiting (HTTP only)
// - Key by authenticated userId when a valid JWT is present, otherwise fall back to IP.
// - Apply per-route limits so core gameplay is not impacted.
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000));
const RATE_LIMIT_AUTH_MAX = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '30');
const RATE_LIMIT_DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || '300');
const RATE_LIMIT_GAME_MAX = parseInt(process.env.RATE_LIMIT_GAME_MAX || '2000');
const RATE_LIMIT_ROOM_MAX = parseInt(process.env.RATE_LIMIT_ROOM_MAX || '2000');

const getRateLimitKey = (req) => {
  try {
    const raw = req.header('Authorization');
    const token = raw && raw.startsWith('Bearer ') ? raw.slice('Bearer '.length) : null;
    if (!token) return `ip:${req.ip}`;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded && decoded.userId ? String(decoded.userId) : null;
    if (!userId) return `ip:${req.ip}`;
    return `user:${userId}`;
  } catch (e) {
    return `ip:${req.ip}`;
  }
};

const makeLimiter = (max) => rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  skip: (req) => {
    // Skip preflight requests
    if (req.method === 'OPTIONS') return true;
    return false;
  }
});

const authLimiter = makeLimiter(RATE_LIMIT_AUTH_MAX);
const defaultLimiter = makeLimiter(RATE_LIMIT_DEFAULT_MAX);
const roomLimiter = makeLimiter(RATE_LIMIT_ROOM_MAX);
const gameLimiter = makeLimiter(RATE_LIMIT_GAME_MAX);

// Middleware
app.use(helmet());

// CORS must be registered before routes so preflight (OPTIONS) requests succeed.
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stop-the-game', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  
  // Start periodic room cleanup (every 5 minutes)
  // This is a safety net to catch any orphaned empty rooms
  startPeriodicCleanup(5);
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/user', defaultLimiter, userRoutes);
app.use('/api/room', roomLimiter, roomRoutes);
app.use('/api/game', gameLimiter, gameRoutes);
app.use('/api/payment', defaultLimiter, paymentRoutes);
app.use('/api/leaderboard', defaultLimiter, leaderboardRoutes);
app.use('/api/chat', defaultLimiter, chatRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  socketHandlers(io, socket);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
