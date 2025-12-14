const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Game = require('../models/Game');
const Room = require('../models/Room');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { validateAnswers, validateBatchAnswersFast } = require('../utils/openai');

async function runValidationAndBroadcast(app, gameId) {
  const game = await Game.findById(gameId).populate('players.user', 'username displayName');
  if (!game || game.status !== 'validating') return {};
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
  const t0 = Date.now();
  console.log(`[VALIDATION] Start: game=${gameId}, round=${game.currentRound}, unique=${unique.length}`);
  const playersCount = (game.players || []).length;
  const submittedPlayers = game.players.filter(p => p.answers.find(a => a.round === game.currentRound));
  const missingPlayers = playersCount - submittedPlayers.length;
  let totalCatAnswers = 0;
  const perUserLines = [];
  for (const player of game.players) {
    const ans = player.answers.find(a => a.round === game.currentRound);
    if (ans) {
      const list = (ans.categoryAnswers || []).map(ca => {
        totalCatAnswers += 1;
        return `${ca.category}: "${String(ca.answer || '').trim()}"`;
      }).join(', ');
      const uname = player.user?.username || (player.user?._id || player.user || '').toString();
      perUserLines.push(`- ${uname} (${(ans.categoryAnswers || []).length}): ${list}`);
    }
  }
  console.log(`[VALIDATION] Input: game=${gameId}, round=${game.currentRound}, players=${playersCount}, submitted=${submittedPlayers.length}, missing=${missingPlayers}, totalAnswers=${totalCatAnswers}, uniqueItems=${unique.length}, letter=${game.currentLetter}`);
  perUserLines.forEach(l => console.log(`[VALIDATION] Answers ${l}`));

  const resultByKey = await validateBatchAnswersFast(unique.map(u => ({ category: u.category, answer: u.answer })), game.currentLetter, { language: game.language || 'en' });
  const t1 = Date.now();
  console.log(`[VALIDATION] AI done in ${t1 - t0}ms for unique=${unique.length}`);
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
  // Per-answer correctness logs
  try {
    let totalValid = 0, totalInvalid = 0;
    const summaries = [];
    for (const player of game.players) {
      const ans = player.answers.find(a => a.round === game.currentRound);
      if (!ans) continue;
      const uname = player.user?.username || (player.user?._id || player.user || '').toString();
      let c = 0, i = 0;
      for (const ca of (ans.categoryAnswers || [])) {
        const txt = String(ca.answer || '').trim();
        const ok = !!ca.isValid;
        if (ok) { c++; totalValid++; } else { i++; totalInvalid++; }
        console.log(`[VALIDATION] Result - ${uname} | ${ca.category}: "${txt}" => ${ok ? 'VALID' : 'INVALID'}`);
      }
      summaries.push(`[VALIDATION] Summary - ${uname}: correct=${c}, incorrect=${i}`);
    }
    summaries.forEach(l => console.log(l));
    console.log(`[VALIDATION] Output totals: correct=${totalValid}, incorrect=${totalInvalid}`);
  } catch (e) {
    console.error('Validation result logging error:', e);
  }
  game.calculateRoundScores();
  game.status = 'round_ended';
  game.validationInProgress = false;
  game.validationDeadline = null;
  await game.save();
  const standings = game.getStandings();
  const roundResults = game.players.map(p => ({
    user: p.user,
    answers: p.answers.find(a => a.round === game.currentRound)
  }));
  try {
    const io = app.get('io');
    if (io) {
      io.to(`game-${gameId}`).emit('round-results', {
        standings,
        results: roundResults,
        currentRound: game.currentRound,
        timestamp: new Date()
      });
    }
  } catch (e) {}
  console.log(`[VALIDATION] Completed: game=${gameId}, round=${game.currentRound}, totalPlayers=${game.players.length}, totalAnswerSets=${roundResults.length}, totalTime=${Date.now() - t0}ms`);
  return { standings, roundResults };
}

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
      language: room.language || 'en',
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

    const now = new Date();
    const allowDuringValidation = game.status === 'validating' && game.validationDeadline && now <= new Date(game.validationDeadline);
    if (!(game.status === 'playing' || allowDuringValidation)) {
      return res.status(400).json({ message: 'Not in playing phase' });
    }

    // Sanitize answers: trim and restrict to game's selected categories
    const sanitized = Array.isArray(answers) ? answers.map(a => ({
      category: String(a?.category || '').trim(),
      answer: String(a?.answer || '').trim()
    })).filter(a => a.category && typeof a.answer === 'string' && game.categories.includes(a.category)) : [];

    console.log(`[SUBMIT] user=${req.user._id} game=${gameId} round=${game.currentRound} stoppedFirst=${!!stoppedFirst} allowDuringValidation=${!!allowDuringValidation} answers=${sanitized.length}`);
    if (sanitized.length > 0) {
      const details = sanitized.map(a => `${a.category}: "${a.answer}"`).join(', ');
      console.log(`[SUBMIT] details user=${req.user._id} game=${gameId} round=${game.currentRound} -> ${details}`);
    }
    // Build round answer and upsert atomically to avoid VersionError races
    const roundAnswer = {
      round: game.currentRound,
      letter: game.currentLetter,
      categoryAnswers: sanitized,
      stoppedFirst: !!stoppedFirst,
      submittedAt: new Date()
    };

    const graceMs = parseInt(process.env.VALIDATION_GRACE_MS || '3000');
    const setValidation = stoppedFirst ? { status: 'validating', validationDeadline: new Date(Date.now() + graceMs) } : {};

    // 1) Try update existing answer for this round
    const updateExisting = await Game.updateOne(
      { 
        _id: gameId, 
        players: { 
          $elemMatch: { 
            user: req.user._id, 
            'answers.round': game.currentRound 
          } 
        } 
      },
      { $set: Object.assign({ 'players.$[p].answers.$[a]': roundAnswer }, setValidation) },
      { arrayFilters: [ { 'p.user': req.user._id }, { 'a.round': game.currentRound } ] }
    );

    const existed = (updateExisting?.modifiedCount || updateExisting?.nModified || 0) > 0;

    // 2) If none existed, push a new one only if not present yet
    if (!existed) {
      const pushUpdate = await Game.updateOne(
        { 
          _id: gameId, 
          players: { 
            $elemMatch: { 
              user: req.user._id, 
              'answers.round': { $ne: game.currentRound } 
            } 
          } 
        },
        Object.assign({ $push: { 'players.$[p].answers': roundAnswer } }, Object.keys(setValidation).length ? { $set: setValidation } : {}),
        { arrayFilters: [ { 'p.user': req.user._id } ] }
      );
      const pushed = (pushUpdate?.modifiedCount || pushUpdate?.nModified || 0) > 0;
      if (!pushed) {
        return res.status(409).json({ message: 'Concurrent update, please retry' });
      }
    }

    // If we are in validating window and now everyone submitted, trigger validation immediately
    try {
      const g2 = await Game.findById(gameId).select('players currentRound status validationDeadline validationInProgress');
      const allSubmittedNow = g2 && (g2.players || []).every(p => (p.answers || []).some(a => a.round === g2.currentRound));
      const deadlineMs = g2 && g2.validationDeadline ? new Date(g2.validationDeadline).getTime() : 0;
      const nowMs2 = Date.now();
      if (g2 && g2.status === 'validating' && !g2.validationInProgress && allSubmittedNow && (!deadlineMs || nowMs2 <= deadlineMs)) {
        const locked = await Game.findOneAndUpdate(
          { _id: gameId, status: 'validating', $or: [ { validationInProgress: { $exists: false } }, { validationInProgress: false } ] },
          { $set: { validationInProgress: true } },
          { new: true }
        );
        if (locked) {
          runValidationAndBroadcast(req.app, gameId).catch(() => {});
        }
      }
    } catch (e) { /* ignore */ }

    res.json({
      message: 'Answers submitted',
      stoppedFirst,
      status: stoppedFirst ? 'validating' : game.status
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

    const game = await Game.findById(gameId).populate('players.user', 'username displayName');
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'validating') {
      return res.status(400).json({ message: 'Not in validation phase' });
    }

    const allSubmitted = game.players.every(p => p.answers.some(a => a.round === game.currentRound));
    const deadlineMs = game.validationDeadline ? new Date(game.validationDeadline).getTime() : 0;
    const nowMs = Date.now();
    if (!allSubmitted && deadlineMs && nowMs < deadlineMs) {
      return res.status(202).json({ message: 'Waiting for submissions', validationDeadline: game.validationDeadline });
    }

    const locked = await Game.findOneAndUpdate(
      { _id: gameId, status: 'validating', $or: [ { validationInProgress: { $exists: false } }, { validationInProgress: false } ] },
      { $set: { validationInProgress: true } },
      { new: true }
    );
    if (!locked) {
      const g2 = await Game.findById(gameId).select('status');
      if (g2 && g2.status === 'round_ended') {
        const g3 = await Game.findById(gameId).populate('players.user', 'username displayName');
        const standings = g3.getStandings();
        const roundResults = g3.players.map(p => ({
          user: p.user,
          answers: p.answers.find(a => a.round === g3.currentRound)
        }));
        return res.json({ message: 'Validation complete', standings, roundResults });
      }
      return res.status(202).json({ message: 'Validation in progress' });
    }

    const { standings, roundResults } = await runValidationAndBroadcast(req.app, gameId);
    return res.json({ message: 'Validation complete', standings, roundResults });
  } catch (error) {
    console.error('Validate error:', error);
    res.status(500).json({ message: 'Error validating answers' });
  }
});

// Next round
router.post('/:gameId/next-round', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId).populate('players.user', 'username displayName');
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'round_ended') {
      return res.status(400).json({ message: 'Round not ended yet' });
    }

    const hasNextRound = game.nextRound();

    if (hasNextRound) {
      // Save game state with new round
      await game.save();
      
      console.log(`[HTTP NEXT-ROUND] Game ${gameId} advancing to round ${game.currentRound}`);

      // Emit event to trigger socket layer to handle timer management
      // Socket layer has centralized timer handling to avoid conflicts
      try {
        const io = req.app.get('io');
        if (io) {
          // Emit advance-round event to trigger socket handler
          io.to(`game-${gameId}`).emit('advance-round-trigger', {
            gameId: gameId.toString(),
            currentRound: game.currentRound
          });
        }
      } catch (e) {
        console.error('[HTTP NEXT-ROUND] Socket emit error:', e);
      }

      res.json({
        message: 'Next round started',
        currentRound: game.currentRound,
        status: game.status,
        letterSelector: game.letterSelector
      });
    } else {
      // Game finished, update user stats
      console.log(`[GAME FINISH] Game ${gameId} has finished! Updating stats...`);
      const standings = game.getStandings();
      console.log(`[GAME FINISH] Standings:`, standings.map(s => ({ user: s.user, score: s.score })));
      
      // Check if there's a tie (multiple players with the same highest score)
      const highestScore = standings[0]?.score || 0;
      const winners = standings.filter(s => s.score === highestScore);
      const isTie = winners.length > 1;
      console.log(`[GAME FINISH] Highest score: ${highestScore}, Winners count: ${winners.length}, Is tie: ${isTie}`);
      console.log(`[GAME FINISH] Game winner:`, game.winner);
      
      // Update stats for all participants (defensive init)
      const scoreByUserId = new Map(
        standings.map(s => [String((s.user && (s.user._id || s.user)) || ''), Number(s.score) || 0])
      );
      const participants = Array.isArray(game.players) ? game.players : [];
      for (const p of participants) {
        const userId = (p.user && (p.user._id || p.user)) || p.user;
        if (!userId) continue;
        console.log(`[GAME FINISH] Processing player ${userId}...`);
        const user = await User.findById(userId);
        if (user) {
          console.log(`[GAME FINISH] Before update - ${user.displayName}: matchesPlayed=${user.matchesPlayed}, winPoints=${user.winPoints}`);
          if (typeof user.matchesPlayed !== 'number' || !Number.isFinite(user.matchesPlayed)) {
            user.matchesPlayed = 0;
          }
          user.matchesPlayed += 1;
          if (!isTie && game.winner) {
            const winnerId = game.winner._id || game.winner;
            if (String(userId) === String(winnerId)) {
              if (typeof user.winPoints !== 'number' || !Number.isFinite(user.winPoints)) {
                user.winPoints = 0;
              }
              const addScore = scoreByUserId.get(String(userId)) || 0;
              user.winPoints += addScore;
              console.log(`[GAME FINISH] Winner ${user.displayName} (${userId}) earned ${addScore} points. Total winPoints: ${user.winPoints}`);
            }
          } else if (isTie) {
            console.log(`[GAME FINISH] Draw detected - no winPoints awarded to ${user.displayName}`);
          }
          await user.save();
          console.log(`[GAME FINISH] After save - ${user.displayName}: matchesPlayed=${user.matchesPlayed}, winPoints=${user.winPoints}`);
        } else {
          console.log(`[GAME FINISH] ERROR: User ${userId} not found in database!`);
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

      // Also emit socket event so clients reliably receive finish notification
      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`game-${gameId}`).emit('game-finished', {
            winner: (game.winner || null),
            standings
          });
        }
      } catch (e) {
        console.error('[HTTP NEXT-ROUND] Failed to emit game-finished:', e);
      }

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

// Check for active game to reconnect
router.get('/reconnect/check', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find games where user is a player, marked as disconnected, and game is still active
    const activeGame = await Game.findOne({
      'players.user': userId,
      'players': {
        $elemMatch: {
          user: userId,
          disconnected: true
        }
      },
      status: { $nin: ['finished'] }
    }).populate('room', 'name inviteCode');

    if (!activeGame) {
      return res.json({ hasActiveGame: false });
    }

    const roomRef = activeGame.room;
    const roomId = roomRef ? (roomRef._id || roomRef) : null;
    if (!roomId) {
      try {
        await Game.deleteOne({ _id: activeGame._id });
      } catch (e) {}
      return res.json({ hasActiveGame: false, reason: 'room_missing' });
    }

    // Check if the room still exists
    const room = await Room.findById(roomId);
    if (!room) {
      try {
        await Game.deleteOne({ _id: activeGame._id });
      } catch (e) {}
      return res.json({ hasActiveGame: false, reason: 'room_missing' });
    }

    res.json({
      hasActiveGame: true,
      gameId: activeGame._id,
      roomId: roomId,
      roomName: room.name,
      status: activeGame.status,
      currentRound: activeGame.currentRound,
      totalRounds: activeGame.rounds
    });
  } catch (error) {
    console.error('Check reconnect error:', error);
    res.status(500).json({ message: 'Error checking for active game' });
  }
});

// Get game state
router.get('/:gameId', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId)
      .populate('players.user', 'username displayName winPoints')
      .populate('letterSelector', 'username displayName')
      .populate('winner', 'username displayName');

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({
      game: {
        id: game._id,
        language: game.language,
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
