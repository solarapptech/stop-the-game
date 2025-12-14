const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  language: {
    type: String,
    enum: ['en', 'es'],
    default: 'en'
  },
  rounds: {
    type: Number,
    required: true
  },
  currentRound: {
    type: Number,
    default: 1
  },
  categories: [{
    type: String,
    enum: ['Name', 'Last Name', 'City/Country', 'Animal', 'Fruit/Food', 'Color', 'Object', 'Brand', 'Profession', 'Sports']
  }],
  players: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    score: {
      type: Number,
      default: 0
    },
    disconnected: {
      type: Boolean,
      default: false
    },
    scoreBeforeDisconnect: {
      type: Number,
      default: 0
    },
    answers: [{
      round: Number,
      letter: String,
      categoryAnswers: [{
        category: String,
        answer: String,
        isValid: Boolean,
        points: Number
      }],
      stoppedFirst: Boolean,
      submittedAt: Date
    }]
  }],
  confirmedPlayers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  categoryReadyPlayers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  currentLetter: {
    type: String,
    default: null
  },
  usedLetters: [{
    type: String
  }],
  letterSelector: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  categoryDeadline: {
    type: Date,
    default: null
  },
  letterDeadline: {
    type: Date,
    default: null
  },
  validationDeadline: {
    type: Date,
    default: null
  },
  validationInProgress: {
    type: Boolean,
    default: false
  },
  roundStartTime: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['selecting_categories', 'selecting_letter', 'playing', 'validating', 'round_ended', 'finished'],
    default: 'selecting_categories'
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add category to game
gameSchema.methods.addCategory = function(category, userId) {
  if (this.categories.includes(category)) {
    return false;
  }
  
  if (this.categories.length >= 8) {
    return false;
  }
  
  this.categories.push(category);
  return true;
};

// Select random letter
gameSchema.methods.selectRandomLetter = function() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const availableLetters = alphabet.split('').filter(l => !this.usedLetters.includes(l));
  
  if (availableLetters.length === 0) {
    return null;
  }
  
  const randomLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
  this.currentLetter = randomLetter;
  this.usedLetters.push(randomLetter);
  return randomLetter;
};

// Submit answer
gameSchema.methods.submitAnswer = function(userId, answers, stoppedFirst = false) {
  const player = this.players.find(p => p.user.toString() === userId.toString());
  if (!player) {
    return false;
  }
  
  const roundAnswer = {
    round: this.currentRound,
    letter: this.currentLetter,
    categoryAnswers: answers,
    stoppedFirst: stoppedFirst,
    submittedAt: new Date()
  };
  
  // Find existing answer for this round or add new one
  const existingAnswerIndex = player.answers.findIndex(a => a.round === this.currentRound);
  if (existingAnswerIndex !== -1) {
    player.answers[existingAnswerIndex] = roundAnswer;
  } else {
    player.answers.push(roundAnswer);
  }
  
  return true;
};

// Calculate scores for round
gameSchema.methods.calculateRoundScores = function() {
  const roundAnswers = {};
  
  // Collect all answers for this round
  this.players.forEach(player => {
    const answer = player.answers.find(a => a.round === this.currentRound);
    if (answer) {
      roundAnswers[player.user.toString()] = answer;
    }
  });
  
  // Calculate points for each player
  Object.keys(roundAnswers).forEach(playerId => {
    const playerAnswer = roundAnswers[playerId];
    let roundScore = 0;
    
    playerAnswer.categoryAnswers.forEach(catAnswer => {
      if (catAnswer.isValid) {
        // Check if answer is unique among players
        const sameAnswers = Object.values(roundAnswers).filter(pa => 
          pa.categoryAnswers.find(ca => 
            ca.category === catAnswer.category && 
            ca.answer.toLowerCase() === catAnswer.answer.toLowerCase() &&
            ca.isValid
          )
        ).length;
        
        if (sameAnswers === 1) {
          catAnswer.points = 10; // Unique answer
        } else {
          catAnswer.points = 5; // Shared answer
        }
        
        roundScore += catAnswer.points;
      } else {
        catAnswer.points = 0;
      }
    });
    
    // Bonus for stopping first
    if (playerAnswer.stoppedFirst) {
      roundScore += 5;
    }
    
    const player = this.players.find(p => p.user.toString() === playerId);
    if (player) {
      player.score += roundScore;
    }
  });
};

// Get current standings
gameSchema.methods.getStandings = function() {
  return this.players
    .map(p => ({
      user: p.user,
      score: p.score
    }))
    .sort((a, b) => b.score - a.score);
};

// Check if game is finished
gameSchema.methods.isFinished = function() {
  return this.currentRound > this.rounds || this.status === 'finished';
};

// Advance to next round
gameSchema.methods.nextRound = function() {
  if (this.currentRound < this.rounds) {
    this.currentRound++;
    this.currentLetter = null;
    this.status = 'selecting_letter';
    
    // Rotate letter selector (handle populated docs and ObjectIds)
    const getIdStr = (u) => {
      if (!u) return '';
      const id = (u._id) ? u._id : u;
      return id.toString();
    };
    const curSel = getIdStr(this.letterSelector);
    let currentIndex = this.players.findIndex(p => getIdStr(p.user) === curSel);
    if (currentIndex < 0) currentIndex = -1; // if not found, start from -1 so next is 0
    const nextIndex = (currentIndex + 1) % this.players.length;
    const nextUser = this.players[nextIndex].user;
    // Always store as ObjectId, not populated doc
    this.letterSelector = nextUser._id ? nextUser._id : nextUser;
    
    return true;
  }
  
  this.status = 'finished';
  const standings = this.getStandings();
  if (standings.length > 0) {
    this.winner = standings[0].user;
  }
  
  return false;
};

module.exports = mongoose.model('Game', gameSchema);
