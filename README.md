# Stop! The Game 🎮

A multiplayer word game built with React Native (Expo) and Node.js, featuring real-time gameplay, leaderboards, and premium subscriptions.

## 📱 Features

- **Real-time Multiplayer**: Play with friends using Socket.io
- **User Authentication**: JWT-based auth with email verification
- **Google OAuth**: Sign in with Google account
- **Leaderboards**: Global, weekly, and friends rankings
- **Premium Subscription**: One-time payment for lifetime access
- **Payment Integration**: Stripe and PayPal support
- **AI Validation**: OpenAI integration for answer validation
- **Beautiful UI**: React Native Paper components with custom theming

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Expo CLI (`npm install -g expo-cli`)
- Android Studio or Xcode (for device testing)

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file with the following variables:
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/stop-the-game

# JWT & Security
JWT_SECRET=your-jwt-secret-key-here
SESSION_SECRET=your-session-secret-here
ENCRYPTION_KEY=your-32-character-encryption-key

# Email (Resend)
RESEND_API_KEY=your-resend-api-key

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Payment
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# URLs
CLIENT_URL=http://localhost:19006
PORT=5000
```

4. Start the backend server:
```bash
npm start
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Update configuration:
   - In `src/contexts/AuthContext.js`, update the API URL if needed
   - In `src/screens/LoginScreen.js`, replace `YOUR_GOOGLE_CLIENT_ID` with your actual Google OAuth client ID

4. Start Expo development server:
```bash
npx expo start
```

5. Run on device/emulator:
   - Press `a` for Android
   - Press `i` for iOS
   - Scan QR code with Expo Go app on your phone

## 📁 Project Structure

```
stop-the-game/
├── backend/
│   ├── config/         # Configuration files
│   ├── middleware/     # Express middleware
│   ├── models/         # MongoDB schemas
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── utils/          # Utility functions
│   └── server.js       # Main server file
│
└── frontend/
    ├── src/
    │   ├── contexts/   # React contexts (Auth, Socket, Game)
    │   ├── screens/    # App screens
    │   └── theme/      # UI theme configuration
    ├── App.js          # Main app component
    └── package.json    # Dependencies
```

## 🎮 Game Flow

1. **Registration/Login**: Users create an account or sign in
2. **Email Verification**: Verify email to activate account
3. **Main Menu**: Access game rooms, leaderboard, settings
4. **Create/Join Room**: Start a new game or join existing
5. **Room Lobby**: Wait for players, chat, ready up
6. **Gameplay**:
   - Category selection phase
   - Letter selection phase
   - Answer submission (60 seconds)
   - Validation phase
   - Round results
7. **Game End**: View final scores and rankings

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify` - Email verification
- `POST /api/auth/resend` - Resend verification email
- `GET /api/auth/google` - Google OAuth

### Game
- `POST /api/room/create` - Create game room (room language is set from the creator's current UI language)
- `POST /api/room/join/:roomId` - Join game room
- `POST /api/room/join-by-code` - Join game room by invite code
- `GET /api/room/:roomId` - Get room details
- `POST /api/game/start` - Start game
- `POST /api/game/submit-answers` - Submit round answers
- `POST /api/game/validate` - Validate answers with AI
- `GET /api/game/reconnect/check` - Check if the authenticated user has an active in-progress game they can reconnect to

### User
- `PUT /api/user/language` - Update user's UI language

## 🌍 Room Language Enforcement

Rooms have an authoritative language stored in MongoDB:

- `Room.language`: `'en' | 'es'`
- `Game.language`: `'en' | 'es'` (copied from the room when the game starts)

Behavior:

- When creating a room, `Room.language` is set from the creator's current UI language.
- When joining a room (by ID or invite code), if the user's UI language does not match `Room.language`, the API returns:
  - **HTTP 409** with `{ message: "Room language mismatch", roomLanguage: "en" | "es" }`
- AI validation enforces the room/game language during answer validation.

Quick Play:

- The Quick Play socket event includes the desired language:
  - `quickplay-join` payload: `{ language: 'en' | 'es' }`
- Matchmaking uses the user's current UI language (`User.language`) as the game language.
- While searching, the Quick Play UI can also show public rooms found in other languages, with a **Join** action that automatically switches the user's UI language before joining.
- Changing **Game's Language** in the Quick Play modal immediately refreshes matchmaking for the newly selected language.

## ♻️ Reconnect & Cleanup Behavior

### Reconnect

- If you leave/disconnect during an in-progress game, the backend marks you as **disconnected** (your score is preserved).
- The Menu can show a **Reconnect** button when the backend detects an active game where you are disconnected.
- If the game/room no longer exists (for example, it was cleaned up), the Reconnect UI will show **"Game ended"** and the Reconnect button will disappear.

### Background / swipe-kill during an in-progress game

- The Gameplay screen emits `app-background` when the app goes to the background.
- The server schedules a short grace period (currently **5 seconds**). If the app does not return to the foreground within that window, the player is marked as **disconnected** and all other players immediately see the disconnected UI.
- When the app returns to the foreground, the Gameplay screen emits `app-foreground` and the server clears the background timer and restores the player (if they had been marked disconnected).

### Abandoned in-progress games (20s grace)

- If **all players** in an in-progress game are marked as disconnected, the server schedules an automatic cleanup.
- After **20 seconds**, if nobody has reconnected, the server deletes:
  - the `Game` document
  - the associated `Room` document

This prevents orphaned games/rooms and avoids reconnect errors on slower devices.

## 🔐 Session Expiry / Authentication Errors

- If the backend returns a `401` with message `"Please authenticate"` (for example, an expired/invalid JWT), the app will:
  - clear the stored session (`authToken` and cached `user`)
  - show an authentication error prompt
  - allow the user to navigate back to the `Login` screen

This prompt can appear during normal gameplay/navigation or during app startup.

## 🧭 MongoDB TTL Index Migration (IMPORTANT)

Rooms no longer expire via `createdAt` TTL. Instead, rooms use an `expiresAt` field:

- When a room is in `waiting`, `expiresAt` is set to **now + 30 minutes**.
- When a room is `in_progress`, `expiresAt` is set to `null` (so it will not be auto-deleted mid-game).

**You must drop the old TTL index on `createdAt` and create a new TTL index on `expiresAt`.**

Example commands (Mongo shell):

```js
// 1) Inspect indexes
db.rooms.getIndexes()

// 2) Drop the old TTL index (name may differ in your DB)
db.rooms.dropIndex('createdAt_1')

// 3) Create the new TTL index on expiresAt
db.rooms.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

### Leaderboard
- `GET /api/leaderboard/global` - Global rankings
- `GET /api/leaderboard/weekly` - Weekly rankings
- `GET /api/leaderboard/friends` - Friends rankings
- `GET /api/leaderboard/rank/:userId` - User rank

### Payment
- `POST /api/payment/create-stripe-session` - Stripe checkout
- `POST /api/payment/create-paypal-order` - PayPal order
- `GET /api/payment/verify-subscription` - Verify payment

## 🔌 Socket Events

### Client → Server
- `join-room` - Join a game room
- `leave-room` - Leave current room
- `join-game` - Join/re-join an in-progress game (used for reconnect)
- `send-message` - Send chat message
- `player-ready` - Mark ready status
- `start-game` - Start the game
- `select-category` - Select game category
- `select-letter` - Select round letter
- `stop-round` - Stop the round early

### Server → Client
- `room-updated` - Room state changed
- `player-joined` - New player joined
- `player-left` - Player left room
- `message` - Chat message received
- `game-started` - Game has started
- `round-started` - New round began
- `round-ended` - Round finished
- `game-finished` - Game completed

## 🎨 Customization

### Theme
Edit `frontend/src/theme/index.js` to customize:
- Colors
- Fonts
- Component styles

### Categories
Modify `AVAILABLE_CATEGORIES` in `GameplayScreen.js` to add/remove game categories

### Game Rules
Adjust in backend `services/gameService.js`:
- Timer duration
- Points calculation
- Validation rules

## 🚢 Deployment

### Backend (Heroku/Railway)
1. Set environment variables
2. Configure MongoDB Atlas connection
3. Deploy with Git

### Frontend (Expo/EAS)
1. Configure `app.json` for production
2. Build APK/IPA:
```bash
eas build --platform android
eas build --platform ios
```

## 📝 Environment Variables

### Required Services
- **MongoDB**: Database (local or Atlas)
- **Resend**: Email verification
- **OpenAI**: Answer validation
- **Stripe**: Payment processing
- **PayPal**: Alternative payment
- **Google Cloud**: OAuth authentication

## 🐛 Troubleshooting

### Common Issues

1. **Socket connection failed**
   - Check backend is running
   - Verify URL in frontend contexts
   - Check firewall settings

2. **Email verification not working**
   - Verify Resend API key
   - Check spam folder
   - Ensure correct email domain

3. **Payment not processing**
   - Verify Stripe/PayPal credentials
   - Check webhook configuration
   - Ensure HTTPS in production

## 📄 License

MIT License - feel free to use for personal or commercial projects

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## 📧 Support

For issues or questions, please open a GitHub issue or contact support.

---

Built with ❤️ using React Native and Node.js
