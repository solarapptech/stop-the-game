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

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const roomRoutes = require('./routes/room');
const gameRoutes = require('./routes/game');
const paymentRoutes = require('./routes/payment');
const leaderboardRoutes = require('./routes/leaderboard');

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

const io = new Server(server, {
  cors: {
    // origin: CLIENT_URLS,
    origin: '*',
    credentials: true
  }
});

// Expose io to routes via app instance
app.set('io', io);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (CLIENT_URLS.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

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
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/room', roomRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

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
