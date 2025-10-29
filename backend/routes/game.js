const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Game = require('../models/Game');
const Room = require('../models/Room');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { validateAnswers } = require('../utils/openai');

// Start game
router.post('/start/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId).populate('players.user');
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is owner
    if (room.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only room owner can start the game' });
    }

    // Check if room can start
    if (!room.canStart()) {
      return res.status(400).json({ message: 'Need at least 2 players to start' });
    }

    // Create new game
    const game = new Game({
      room: room._id,
      rounds: room.rounds,
      players: room.players.map(p => ({
        user: p.user._id,
        score: 0,
        answers: []
      })),
      letterSelector: room.players[0].user._id
    });

    await game.save();

    // Update room status
    room.status = 'in_progress';
    room.currentGame = game._id;
    await room.save();

    res.json({
      message: 'Game started',
      gameId: game._id
    });
  } catch (error) {
    console.error('Start game error:', error);
    res.status(500).json({ message: 'Error starting game' });
  }
});

// Select categories
router.post('/:gameId/category', authMiddleware, [
  body('category').isIn(['Name', 'Last Name', 'City/Country', 'Animal', 'Fruit/Food', 'Color', 'Object', 'Brand', 'Profession', 'Sports'])
], async (req, res) => {
  try {
    const { gameId } = req.params;
    const { category } = req.body;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'selecting_categories') {
      return res.status(400).json({ message: 'Not in category selection phase' });
    }

    // Check if user is in game
    const isPlayer = game.players.some(p => p.user.toString() === req.user._id.toString());
    if (!isPlayer) {
      return res.status(403).json({ message: 'Not a player in this game' });
    }

    // Add category
    const added = game.addCategory(category, req.user._id);
    if (!added) {
      return res.status(400).json({ message: 'Category already selected or limit reached' });
    }

    await game.save();

    res.json({
      message: 'Category added',
      categories: game.categories,
      count: game.categories.length
    });
  } catch (error) {
    console.error('Select category error:', error);
    res.status(500).json({ message: 'Error selecting category' });
  }
});

// Confirm categories
router.post('/:gameId/confirm-categories', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'selecting_categories') {
      return res.status(400).json({ message: 'Not in category selection phase' });
    }

    // Fill remaining categories randomly if needed
    const availableCategories = ['Name', 'Last Name', 'City/Country', 'Animal', 'Fruit/Food', 'Color', 'Object', 'Brand', 'Profession', 'Sports']
      .filter(c => !game.categories.includes(c));

    while (game.categories.length < 6 && availableCategories.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableCategories.length);
      game.categories.push(availableCategories.splice(randomIndex, 1)[0]);
    }

    game.status = 'selecting_letter';
    await game.save();

    res.json({
      message: 'Categories confirmed',
      categories: game.categories,
      status: game.status
    });
  } catch (error) {
    console.error('Confirm categories error:', error);
    res.status(500).json({ message: 'Error confirming categories' });
  }
});

// Select letter
router.post('/:gameId/letter', authMiddleware, [
  body('letter').optional().isLength({ min: 1, max: 1 }).isAlpha()
], async (req, res) => {
  try {
    const { gameId } = req.params;
    const { letter } = req.body;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'selecting_letter') {
      return res.status(400).json({ message: 'Not in letter selection phase' });
    }

    // Check if user is the letter selector
    if (game.letterSelector.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your turn to select letter' });
    }

    // Set letter or select random
    if (letter && !game.usedLetters.includes(letter.toUpperCase())) {
      game.currentLetter = letter.toUpperCase();
      game.usedLetters.push(letter.toUpperCase());
    } else {
      game.selectRandomLetter();
    }

    game.status = 'playing';
    game.roundStartTime = new Date();
    await game.save();

    res.json({
      message: 'Letter selected',
      letter: game.currentLetter,
      status: game.status
    });
  } catch (error) {
    console.error('Select letter error:', error);
    res.status(500).json({ message: 'Error selecting letter' });
  }
});

// Submit answers
router.post('/:gameId/submit', authMiddleware, [
  body('answers').isArray(),
  body('stoppedFirst').isBoolean()
], async (req, res) => {
  try {
    const { gameId } = req.params;
    const { answers, stoppedFirst } = req.body;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'playing') {
      return res.status(400).json({ message: 'Not in playing phase' });
    }

    // Sanitize answers: trim and restrict to game's selected categories
    const sanitized = Array.isArray(answers) ? answers.map(a => ({
      category: String(a?.category || '').trim(),
      answer: String(a?.answer || '').trim()
    })).filter(a => a.category && typeof a.answer === 'string' && game.categories.includes(a.category)) : [];

    // Submit answers
    const submitted = game.submitAnswer(req.user._id, sanitized, stoppedFirst);
    if (!submitted) {
      return res.status(400).json({ message: 'Failed to submit answers' });
    }

    // If someone stopped first, end the round
    if (stoppedFirst) {
      game.status = 'validating';
    }

    await game.save();

    res.json({
      message: 'Answers submitted',
      stoppedFirst,
      status: game.status
    });
  } catch (error) {
    console.error('Submit answers error:', error);
    res.status(500).json({ message: 'Error submitting answers' });
  }
});

// Validate and calculate scores
router.post('/:gameId/validate', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId).populate('players.user', 'username');
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'validating') {
      return res.status(400).json({ message: 'Not in validation phase' });
    }

    const unique = [];
    const seen = new Set();
    for (const player of game.players) {
      const answer = player.answers.find(a => a.round === game.currentRound);
      if (answer) {
        for (const catAnswer of answer.categoryAnswers) {
          const a = String(catAnswer.answer || '').trim();
          const key = `${catAnswer.category}|${game.currentLetter}|${a.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push({ key, category: catAnswer.category, answer: a });
          }
        }
      }
    }

    const resultByKey = {};
    for (const item of unique) {
      resultByKey[item.key] = await validateAnswers(item.category, game.currentLetter, item.answer);
    }

    for (const player of game.players) {
      const answer = player.answers.find(a => a.round === game.currentRound);
      if (answer) {
        for (const catAnswer of answer.categoryAnswers) {
          const a = String(catAnswer.answer || '').trim();
          const key = `${catAnswer.category}|${game.currentLetter}|${a.toLowerCase()}`;
          catAnswer.isValid = !!resultByKey[key];
        }
      }
    }

    // Calculate scores
    game.calculateRoundScores();
    game.status = 'round_ended';
    await game.save();

    const standings = game.getStandings();
    const roundResults = game.players.map(p => ({
      user: p.user,
      answers: p.answers.find(a => a.round === game.currentRound)
    }));

    // Broadcast results to all players in the room via sockets
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`game-${gameId}`).emit('round-results', {
          standings,
          results: roundResults,
          currentRound: game.currentRound,
          timestamp: new Date()
        });
      }
    } catch (e) {
      // ignore socket errors
    }

    res.json({
      message: 'Validation complete',
      standings,
      roundResults
    });
  } catch (error) {
    console.error('Validate error:', error);
    res.status(500).json({ message: 'Error validating answers' });
  }
});

// Next round
router.post('/:gameId/next-round', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId).populate('players.user', 'username');
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'round_ended') {
      return res.status(400).json({ message: 'Round not ended yet' });
    }

    const hasNextRound = game.nextRound();

    if (hasNextRound) {
      // Start 12s letter selection window for the new selector
      const selectorId = (game.letterSelector || '').toString();
      const selectorPlayer = (game.players || []).find(p => (p.user._id || p.user).toString() === selectorId);
      const selectorName = selectorPlayer?.user?.username || 'Player';
      const deadline = new Date(Date.now() + 12000);
      game.letterDeadline = deadline;
      await game.save();

      // Broadcast to socket room
      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`game-${gameId}`).emit('letter-selection-started', {
            gameId,
            selectorId,
            selectorName,
            deadline,
            currentRound: game.currentRound
          });
        }
      } catch (e) {
        // ignore emit errors
      }

      // Schedule auto-pick after 12s if no letter chosen
      setTimeout(async () => {
        try {
          const g = await Game.findById(gameId);
          if (g && g.status === 'selecting_letter' && !g.currentLetter) {
            g.selectRandomLetter();
            g.letterDeadline = null;
            await g.save();

            const io2 = req.app.get('io');
            const revealDeadline = new Date(Date.now() + 3000);
            if (io2) {
              io2.to(`game-${gameId}`).emit('letter-accepted', {
                letter: g.currentLetter,
                revealDeadline
              });
            }

            setTimeout(async () => {
              const gg = await Game.findById(gameId);
              if (!gg) return;
              gg.status = 'playing';
              gg.roundStartTime = new Date();
              await gg.save();
              const io3 = req.app.get('io');
              if (io3) {
                io3.to(`game-${gameId}`).emit('letter-selected', {
                  letter: gg.currentLetter
                });
              }
            }, 3000);
          }
        } catch (e) {
          // ignore timer errors
        }
      }, 12000);

      res.json({
        message: 'Next round started',
        currentRound: game.currentRound,
        status: game.status,
        letterSelector: game.letterSelector
      });
    } else {
      // Game finished, update user stats
      const standings = game.getStandings();
      for (const standing of standings) {
        const user = await User.findById(standing.user);
        if (user) {
          user.matchesPlayed += 1;
          if (standing.user.toString() === game.winner.toString()) {
            user.winPoints += standing.score;
          }
          await user.save();
        }
      }

      // Update room status
      const room = await Room.findById(game.room);
      if (room) {
        room.status = 'waiting';
        room.currentGame = null;
        await room.save();
      }

      await game.save();

      res.json({
        message: 'Game finished',
        winner: game.winner,
        finalStandings: standings,
        status: game.status
      });
    }
  } catch (error) {
    console.error('Next round error:', error);
    res.status(500).json({ message: 'Error advancing to next round' });
  }
});

// Get game state
router.get('/:gameId', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId)
      .populate('players.user', 'username winPoints')
      .populate('letterSelector', 'username')
      .populate('winner', 'username');

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({
      game: {
        id: game._id,
        rounds: game.rounds,
        currentRound: game.currentRound,
        categories: game.categories,
        currentLetter: game.currentLetter,
        usedLetters: game.usedLetters,
        letterSelector: game.letterSelector,
        status: game.status,
        players: game.players.map(p => ({
          user: p.user,
          score: p.score,
          hasSubmitted: p.answers.some(a => a.round === game.currentRound)
        })),
        standings: game.getStandings(),
        winner: game.winner,
        isFinished: game.isFinished()
      }
    });
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ message: 'Error fetching game' });
  }
});

module.exports = router;
