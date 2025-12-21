const mongoose = require('mongoose');

const ROOM_TTL_MS = 15 * 60 * 1000;

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  initialOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  password: {
    type: String,
    default: null
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  language: {
    type: String,
    enum: ['en', 'es'],
    default: 'en'
  },
  rounds: {
    type: Number,
    enum: [1, 3, 6, 9],
    default: 3
  },
  players: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isReady: {
      type: Boolean,
      default: false
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  maxPlayers: {
    type: Number,
    default: 8,
    min: 2,
    max: 8
  },
  status: {
    type: String,
    enum: ['waiting', 'in_progress', 'finished'],
    default: 'waiting'
  },
  inviteCode: {
    type: String,
    unique: true,
    sparse: true
  },
  currentGame: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + ROOM_TTL_MS),
    expires: 0
  }
}, {
  timestamps: true
});

roomSchema.pre('save', function(next) {
  this.expiresAt = new Date(Date.now() + ROOM_TTL_MS);
  next();
});

roomSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() || {};
  update.$set = update.$set || {};
  update.$set.expiresAt = new Date(Date.now() + ROOM_TTL_MS);
  this.setUpdate(update);
  next();
});

roomSchema.pre('updateOne', function(next) {
  const update = this.getUpdate() || {};
  update.$set = update.$set || {};
  update.$set.expiresAt = new Date(Date.now() + ROOM_TTL_MS);
  this.setUpdate(update);
  next();
});

roomSchema.pre('updateMany', function(next) {
  const update = this.getUpdate() || {};
  update.$set = update.$set || {};
  update.$set.expiresAt = new Date(Date.now() + ROOM_TTL_MS);
  this.setUpdate(update);
  next();
});

// Generate unique invite code
roomSchema.methods.generateInviteCode = function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  this.inviteCode = code;
  return code;
};

// Add player to room
roomSchema.methods.addPlayer = function(userId) {
  const existingPlayer = this.players.find(p => {
    const pid = (p.user && p.user._id) ? p.user._id.toString() : p.user.toString();
    return pid === userId.toString();
  });
  if (existingPlayer) {
    return false;
  }
  
  if (this.players.length >= this.maxPlayers) {
    throw new Error('Room is full');
  }
  
  // Owner should always be ready
  const isOwner = this.owner.toString() === userId.toString();
  
  this.players.push({
    user: userId,
    isReady: isOwner
  });
  
  return true;
};

// Remove player from room
roomSchema.methods.removePlayer = function(userId) {
  const index = this.players.findIndex(p => {
    const pid = (p.user && p.user._id) ? p.user._id.toString() : p.user.toString();
    return pid === userId.toString();
  });
  if (index !== -1) {
    this.players.splice(index, 1);
    return true;
  }
  return false;
};

// Check if user is in room
roomSchema.methods.hasPlayer = function(userId) {
  return this.players.some(p => {
    const pid = (p.user && p.user._id) ? p.user._id.toString() : p.user.toString();
    return pid === userId.toString();
  });
};

// Set player ready status
roomSchema.methods.setPlayerReady = function(userId, isReady) {
  const player = this.players.find(p => {
    const pid = (p.user && p.user._id) ? p.user._id.toString() : p.user.toString();
    return pid === userId.toString();
  });
  if (player) {
    player.isReady = isReady;
    return true;
  }
  return false;
};

// Check if all players are ready
roomSchema.methods.allPlayersReady = function() {
  return this.players.length >= 2 && this.players.every(p => p.isReady);
};

// Check if room can start
roomSchema.methods.canStart = function() {
  return this.players.length >= 2 && this.status === 'waiting';
};

module.exports = mongoose.model('Room', roomSchema);
