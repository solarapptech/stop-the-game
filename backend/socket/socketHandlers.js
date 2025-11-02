const Room = require('../models/Room');
const Game = require('../models/Game');
const jwt = require('jsonwebtoken');
const { validateBatchAnswersFast } = require('../utils/openai');
const categoryTimers = new Map();
const letterTimers = new Map();
const letterRevealTimers = new Map();
const roundTimers = new Map();
const nextRoundTimers = new Map();
const nextRoundReady = new Map();
const rematchReady = new Map();
const rematchCountdownTimers = new Map();
const validationTimers = new Map();
const quickPlayQueue = new Set(); // Set of socket IDs waiting for quick play match

module.exports = (io, socket) => {
  // Helper to clean up empty rooms - CRITICAL for preventing orphaned rooms
  const cleanupEmptyRoom = async (roomId) => {
    try {
      if (!roomId) return false;
      
      const room = await Room.findById(roomId).select('players name');
      if (!room) {
        console.log(`[ROOM CLEANUP] Room ${roomId} not found (already deleted)`);
        return false;
      }
      
      if (room.players.length === 0) {
        console.log(`[ROOM CLEANUP] Deleting empty room: ${roomId} (${room.name})`);
        await Room.deleteOne({ _id: roomId });
        
        // Clean up any associated timers
        rematchReady.delete(roomId.toString());
        const rematchTimer = rematchCountdownTimers.get(roomId.toString());
        if (rematchTimer) {
          clearInterval(rematchTimer);
          rematchCountdownTimers.delete(roomId.toString());
        }
        
        console.log(`[ROOM CLEANUP] Successfully deleted room ${roomId}`);
        return true;
      }
      
      console.log(`[ROOM CLEANUP] Room ${roomId} still has ${room.players.length} player(s), not deleting`);
      return false;
    } catch (error) {
      console.error('[ROOM CLEANUP] Error cleaning up room:', error);
      return false;
    }
  };

  // Helper to finalize categories for a game (dedupe, fill to min 6, cap at 8)
  const finalizeCategories = async (gameId) => {
    try {
      const game = await Game.findById(gameId).populate('players.user', 'username');
      if (!game || game.status !== 'selecting_categories') return;

      const allowed = ['Name', 'Last Name', 'City/Country', 'Animal', 'Fruit/Food', 'Color', 'Object', 'Brand', 'Profession', 'Sports'];
      // Deduplicate
      game.categories = Array.from(new Set(game.categories));

      // Fill to min 6
      const remaining = allowed.filter(c => !game.categories.includes(c));
      while (game.categories.length < 6 && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        game.categories.push(remaining.splice(idx, 1)[0]);
      }

      // Cap at 8
      if (game.categories.length > 8) {
        game.categories = game.categories.slice(0, 8);
      }

      game.status = 'selecting_letter';
      game.categoryDeadline = null;
      await game.save();

      io.to(`game-${gameId}`).emit('categories-confirmed', {
        categories: game.categories,
        currentPlayer: (game.letterSelector || '').toString()
      });

      // Immediately start letter selection phase with 12s deadline
      const selectorId = (game.letterSelector || '').toString();
      const selectorPlayer = game.players.find(p => (p.user._id || p.user).toString() === selectorId);
      const selectorName = selectorPlayer?.user?.username || 'Player';
      const letterDeadline = new Date(Date.now() + 12000);
      game.letterDeadline = letterDeadline;
      await game.save();

      io.to(`game-${gameId}`).emit('letter-selection-started', {
        gameId,
        selectorId,
        selectorName,
        deadline: letterDeadline,
        currentRound: game.currentRound
      });

      // Schedule auto-pick after 12s if not chosen
      const existingL = letterTimers.get(game._id.toString());
      if (existingL) clearTimeout(existingL);
      const selTimer = setTimeout(async () => {
        letterTimers.delete(game._id.toString());
        try {
          const g = await Game.findById(game._id);
          if (g && g.status === 'selecting_letter' && !g.currentLetter) {
            // Auto-pick a random letter and proceed with reveal
            const autoLetter = g.selectRandomLetter();
            g.letterDeadline = null;
            await g.save();

            const revealDeadline = new Date(Date.now() + 3000);
            io.to(`game-${gameId}`).emit('letter-accepted', {
              letter: g.currentLetter,
              revealDeadline
            });

            const existingR = letterRevealTimers.get(game._id.toString());
            if (existingR) clearTimeout(existingR);
            const revTimer = setTimeout(async () => {
              letterRevealTimers.delete(game._id.toString());
              const gg = await Game.findById(game._id);
              if (!gg) return;
              gg.status = 'playing';
              gg.roundStartTime = new Date();
              await gg.save();
              io.to(`game-${gameId}`).emit('letter-selected', {
                letter: gg.currentLetter
              });
              const existingRound = roundTimers.get(game._id.toString());
              if (existingRound) clearTimeout(existingRound);
              const rt = setTimeout(async () => {
                roundTimers.delete(game._id.toString());
                try {
                  const g3 = await Game.findById(game._id);
                  if (g3 && g3.status === 'playing') {
                    g3.status = 'validating';
                    const graceMs = parseInt(process.env.VALIDATION_GRACE_MS || '3000');
                    g3.validationDeadline = new Date(Date.now() + graceMs);
                    await g3.save();
                    io.to(`game-${gameId}`).emit('round-ended', { reason: 'timeout', validationDeadline: g3.validationDeadline });
                    const vt = validationTimers.get(game._id.toString());
                    if (vt) clearTimeout(vt);
                    const allSubmitted = (g3.players || []).every(p => (p.answers || []).some(a => a.round === g3.currentRound));
                    const waitMs = allSubmitted ? 0 : graceMs;
                    console.log(`[ROUND END] reason=timeout game=${gameId} round=${g3.currentRound} allSubmitted=${allSubmitted} graceMs=${graceMs} waitMs=${waitMs}`);
                    const timer = setTimeout(async () => {
                      validationTimers.delete(game._id.toString());
                      try {
                        const locked = await Game.findOneAndUpdate(
                          { _id: game._id, status: 'validating', $or: [ { validationInProgress: { $exists: false } }, { validationInProgress: false } ] },
                          { $set: { validationInProgress: true } },
                          { new: true }
                        );
                        if (locked) await runValidation(gameId);
                      } catch (e) {
                        console.error('Auto validation error:', e);
                      }
                    }, waitMs);
                    validationTimers.set(game._id.toString(), timer);
                  }
                } catch (e) {
                  console.error('Round auto-end error:', e);
                }
              }, 60000);
              roundTimers.set(game._id.toString(), rt);
            }, 3000);
            letterRevealTimers.set(game._id.toString(), revTimer);
          }
        } catch (e) {
          console.error('Auto-pick letter error:', e);
        }
      }, 12000);
      letterTimers.set(game._id.toString(), selTimer);
    } catch (error) {
      console.error('Finalize categories error:', error);
    }
  };

  // Run validation and broadcast results for the current round
  const runValidation = async (gameId) => {
    try {
      const game = await Game.findById(gameId).populate('players.user', 'username');
      if (!game || game.status !== 'validating') return;
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

      const resultByKey = await validateBatchAnswersFast(unique.map(u => ({ category: u.category, answer: u.answer })), game.currentLetter);
      console.log(`[VALIDATION] AI done in ${Date.now() - t0}ms for unique=${unique.length}`);
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
      io.to(`game-${gameId}`).emit('round-results', {
        standings,
        results: roundResults,
        currentRound: game.currentRound,
        timestamp: new Date()
      });
      console.log(`[VALIDATION] Completed: game=${gameId}, round=${game.currentRound}, totalPlayers=${game.players.length}, totalAnswerSets=${roundResults.length}, totalTime=${Date.now() - t0}ms`);
    } catch (err) {
      console.error('Socket runValidation error:', err);
      try { await Game.updateOne({ _id: gameId }, { $set: { validationInProgress: false } }); } catch (e) {}
    }
  };
  // Authenticate socket connection
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.emit('authenticated', { success: true });
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Invalid token' });
    }
  });

  // Join room
  socket.on('join-room', async (roomId) => {
    try {
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const room = await Room.findById(roomId)
        .populate('players.user', 'username winPoints');

      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      // Join socket room
      socket.join(roomId);
      socket.roomId = roomId;

      // Notify others in room about the new player
      const joiningPlayer = room.players.find(p => 
        (p.user._id || p.user).toString() === socket.userId.toString()
      );
      
      socket.to(roomId).emit('player-joined', {
        roomId,
        players: room.players,
        username: joiningPlayer?.user?.username || 'Player'
      });

      socket.emit('room-joined', {
        roomId,
        room: room.toObject()
      });
    } catch (error) {
      console.error('Join room socket error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Leave room (atomic updates to avoid version conflicts)
  socket.on('leave-room', async () => {
    try {
      if (!(socket.roomId && socket.userId)) return;

      const roomIdToCleanup = socket.roomId;
      const User = require('../models/User');
      const user = await User.findById(socket.userId);
      const username = user?.username || 'Player';

      console.log(`[LEAVE ROOM] User ${socket.userId} (${username}) leaving room ${roomIdToCleanup}`);

      // Load room to determine ownership before removal
      const roomBefore = await Room.findById(socket.roomId).select('owner players')
        .populate('players.user', 'username winPoints');
      if (!roomBefore) {
        console.log(`[LEAVE ROOM] Room ${socket.roomId} not found`);
        socket.roomId = null;
        return;
      }

      const wasOwner = roomBefore.owner.toString() === socket.userId.toString();

      // Remove player using atomic $pull
      let room = await Room.findOneAndUpdate(
        { _id: socket.roomId },
        { $pull: { players: { user: socket.userId } } },
        { new: true }
      ).populate('players.user', 'username winPoints');

      if (!room) {
        socket.roomId = null;
        return;
      }

      console.log(`[LEAVE ROOM] After removal, room ${room._id} has ${room.players.length} player(s)`);

      // Leave socket room BEFORE cleanup
      socket.leave(roomIdToCleanup);
      socket.roomId = null;

      // Check if room is empty and delete if so
      if (room.players.length === 0) {
        console.log(`[LEAVE ROOM] Room is empty, calling cleanup`);
        await cleanupEmptyRoom(room._id);
      } else {
        // Room still has players
        if (wasOwner) {
          // Transfer ownership to next player and set them ready
          const next = room.players[0];
          const newOwnerId = (next.user._id || next.user).toString();
          console.log(`[LEAVE ROOM] Transferring ownership to ${newOwnerId}`);
          
          await Room.updateOne(
            { _id: room._id },
            { 
              $set: { owner: newOwnerId, 'players.$[elem].isReady': true }
            },
            { arrayFilters: [ { 'elem.user': next.user._id || next.user } ] }
          );
          // Reload populated
          room = await Room.findById(room._id).populate('players.user', 'username winPoints');

          io.to(roomIdToCleanup).emit('ownership-transferred', {
            newOwnerId,
            players: room.players,
            username: next.user.username || 'Player',
            inviteCode: room.inviteCode
          });
        }

        // Notify others about the player leaving with updated list
        io.to(roomIdToCleanup).emit('player-left', {
          roomId: roomIdToCleanup,
          players: room.players,
          username,
          newOwnerId: wasOwner && room.players.length > 0 ? (room.players[0].user._id || room.players[0].user).toString() : null
        });
      }
    } catch (error) {
      console.error('Leave room socket error:', error);
    }
  });

  // Player ready (atomic update to avoid version conflicts)
  socket.on('player-ready', async (data) => {
    try {
      const { roomId, isReady } = data;
      
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const result = await Room.updateOne(
        { _id: roomId, 'players.user': socket.userId },
        { $set: { 'players.$.isReady': isReady } }
      );

      if (!result.matchedCount) {
        return socket.emit('error', { message: 'Room not found or not in room' });
      }

      // Fetch minimal data to compute allReady
      const updated = await Room.findById(roomId).select('players status');
      const allReady = updated && updated.players.length >= 2 && updated.players.every(p => p.isReady);

      io.to(roomId).emit('ready-status-changed', {
        userId: socket.userId,
        isReady,
        allReady
      });
    } catch (error) {
      console.error('Player ready socket error:', error);
      socket.emit('error', { message: 'Failed to update ready status' });
    }
  });

  // Start game (create Game, wait for clients to be ready for category selection)
  socket.on('start-game', async (roomId) => {
    try {
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const room = await Room.findById(roomId).populate('players.user');
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      if (room.owner.toString() !== socket.userId.toString()) {
        return socket.emit('error', { message: 'Only owner can start game' });
      }

      if (!(room.players && room.players.length >= 2)) {
        return socket.emit('error', { message: 'Need at least 2 players to start' });
      }

      // Create game
      const game = new Game({
        room: room._id,
        rounds: room.rounds,
        players: room.players.map(p => ({
          user: p.user._id || p.user,
          score: 0,
          answers: []
        })),
        letterSelector: (room.players[0].user._id || room.players[0].user)
      });
      // Initialize selecting_categories phase, but do NOT start deadline yet
      game.categoryDeadline = null;
      game.status = 'selecting_categories';
      game.confirmedPlayers = [];
      game.categoryReadyPlayers = [];
      await game.save();

      // Update room status
      room.status = 'in_progress';
      room.currentGame = game._id;
      await room.save();

      // Notify clients
      io.to(roomId).emit('game-starting', {
        roomId,
        gameId: game._id,
        countdown: 0
      });

      // Do not start selection timer yet; wait for all players to be ready
    } catch (error) {
      console.error('Start game socket error:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // Game events
  socket.on('join-game', async (gameId) => {
    try {
      socket.join(`game-${gameId}`);
      socket.gameId = gameId;
      socket.emit('game-joined', { gameId });

      // Send current category selection state if applicable
      try {
        const game = await Game.findById(gameId).populate('players.user', 'username');
        if (!game) return;
        if (game.status === 'selecting_categories' && game.categoryDeadline) {
          socket.emit('category-selection-started', {
            gameId,
            categories: game.categories || [],
            deadline: game.categoryDeadline,
            confirmed: (game.confirmedPlayers || []).length,
            total: (game.players || []).length
          });
        }
        if (game.status === 'selecting_letter' && game.letterDeadline) {
          const selectorId = (game.letterSelector || '').toString();
          const selectorPlayer = (game.players || []).find(p => (p.user._id || p.user).toString() === selectorId);
          const selectorName = selectorPlayer?.user?.username || 'Player';
          socket.emit('letter-selection-started', {
            gameId,
            selectorId,
            selectorName,
            deadline: game.letterDeadline,
            currentRound: game.currentRound
          });
        }
      } catch (e) {}
    } catch (error) {
      console.error('Join game socket error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Players signal they are inside the Select Categories screen
  socket.on('category-phase-ready', async (gameId) => {
    try {
      if (!socket.userId) return;
      const game = await Game.findById(gameId).populate('players.user', 'username');
      if (!game) return;
      if (game.status !== 'selecting_categories') return;

      // Add to ready list if not present
      const already = (game.categoryReadyPlayers || []).some(id => id.toString() === socket.userId.toString());
      if (!already) {
        game.categoryReadyPlayers.push(socket.userId);
        await game.save();
      }

      // If all players are ready and no deadline yet, start 60s timer
      const allReady = game.categoryReadyPlayers.length >= game.players.length;
      const noDeadline = !game.categoryDeadline;
      if (allReady && noDeadline) {
        const deadline = new Date(Date.now() + 60000);
        game.categoryDeadline = deadline;
        await game.save();

        io.to(`game-${gameId}`).emit('category-selection-started', {
          gameId,
          categories: game.categories || [],
          deadline,
          confirmed: (game.confirmedPlayers || []).length,
          total: (game.players || []).length
        });

        // Schedule finalize after 60s
        const existing = categoryTimers.get(game._id.toString());
        if (existing) clearTimeout(existing);
        const timer = setTimeout(async () => {
          categoryTimers.delete(game._id.toString());
          await finalizeCategories(game._id.toString());
        }, 60000);
        categoryTimers.set(game._id.toString(), timer);
      }
    } catch (error) {
      console.error('Category phase ready socket error:', error);
    }
  });

  // Category selected (unique across game, max 8)
  socket.on('category-selected', async (data) => {
    try {
      const { gameId, category } = data;
      const allowed = ['Name', 'Last Name', 'City/Country', 'Animal', 'Fruit/Food', 'Color', 'Object', 'Brand', 'Profession', 'Sports'];

      if (!socket.userId) return;
      if (!allowed.includes(category)) return;

      // Prevent confirmed players from selecting more
      const gCheck = await Game.findById(gameId).select('status confirmedPlayers');
      if (!gCheck) return;
      if (gCheck.status !== 'selecting_categories') return;
      if ((gCheck.confirmedPlayers || []).some(id => id.toString() === socket.userId.toString())) return;

      // Atomic add to avoid duplicates under race
      await Game.updateOne(
        {
          _id: gameId,
          status: 'selecting_categories',
          categories: { $ne: category },
          $expr: { $lt: [ { $size: "$categories" }, 8 ] }
        },
        { $addToSet: { categories: category } }
      );

      const updated = await Game.findById(gameId).select('categories');
      if (!updated) return;

      io.to(`game-${gameId}`).emit('category-selected', {
        categories: updated.categories
      });
    } catch (error) {
      console.error('Category selected socket error:', error);
    }
  });

  // Confirm categories (track per-player confirmations, finalize early if all confirm and min reached)
  socket.on('confirm-categories', async (gameId) => {
    try {
      if (!socket.userId) return;
      const game = await Game.findById(gameId).populate('players.user', 'username');
      if (!game) return;
      if (game.status !== 'selecting_categories') return;

      const already = game.confirmedPlayers.some(id => id.toString() === socket.userId.toString());
      if (!already) {
        game.confirmedPlayers.push(socket.userId);
        await game.save();
      }

      const allConfirmed = game.confirmedPlayers.length >= game.players.length;
      const minReached = game.categories.length >= 6;
      if (allConfirmed && minReached) {
        const t = categoryTimers.get(game._id.toString());
        if (t) {
          clearTimeout(t);
          categoryTimers.delete(game._id.toString());
        }
        await finalizeCategories(game._id.toString());
      } else {
        io.to(`game-${gameId}`).emit('confirm-update', {
          confirmed: game.confirmedPlayers.length,
          total: game.players.length
        });
      }
    } catch (error) {
      console.error('Confirm categories socket error:', error);
    }
  });

  // Letter selected: only selector can choose; accept then reveal with 3s countdown
  socket.on('letter-selected', async (data) => {
    try {
      const { gameId, letter } = data;
      const game = await Game.findById(gameId);
      if (!game) return;
      if (game.status !== 'selecting_letter') return;
      if (game.letterSelector.toString() !== socket.userId.toString()) return;

      // Clear letter selection timer if running
      const lt = letterTimers.get(game._id.toString());
      if (lt) {
        clearTimeout(lt);
        letterTimers.delete(game._id.toString());
      }

      let chosen = null;
      if (letter && /^[A-Za-z]$/.test(letter)) {
        const up = letter.toUpperCase();
        if (!game.usedLetters.includes(up)) {
          game.currentLetter = up;
          game.usedLetters.push(up);
          chosen = up;
        }
      }
      if (!chosen) {
        chosen = game.selectRandomLetter();
      }
      game.letterDeadline = null;
      await game.save();

      const revealDeadline = new Date(Date.now() + 3000);
      io.to(`game-${gameId}`).emit('letter-accepted', {
        letter: game.currentLetter,
        revealDeadline
      });

      const existingR = letterRevealTimers.get(game._id.toString());
      if (existingR) clearTimeout(existingR);
      const revTimer = setTimeout(async () => {
        letterRevealTimers.delete(game._id.toString());
        const gg = await Game.findById(game._id);
        if (!gg) return;
        gg.status = 'playing';
        gg.roundStartTime = new Date();
        await gg.save();
        io.to(`game-${gameId}`).emit('letter-selected', {
          letter: gg.currentLetter
        });
        // start 60s round auto-end timer
        const existingRound = roundTimers.get(game._id.toString());
        if (existingRound) clearTimeout(existingRound);
        const rt = setTimeout(async () => {
          roundTimers.delete(game._id.toString());
          try {
            const g3 = await Game.findById(game._id);
            if (g3 && g3.status === 'playing') {
              g3.status = 'validating';
              const graceMs = parseInt(process.env.VALIDATION_GRACE_MS || '3000');
              g3.validationDeadline = new Date(Date.now() + graceMs);
              await g3.save();
              io.to(`game-${gameId}`).emit('round-ended', { reason: 'timeout', validationDeadline: g3.validationDeadline });

              // Schedule validation similar to STOP path
              const vt = validationTimers.get(game._id.toString());
              if (vt) clearTimeout(vt);
              const allSubmitted = (g3.players || []).every(p => (p.answers || []).some(a => a.round === g3.currentRound));
              const waitMs = allSubmitted ? 0 : graceMs;
              console.log(`[ROUND END] reason=timeout game=${gameId} round=${g3.currentRound} allSubmitted=${allSubmitted} graceMs=${graceMs} waitMs=${waitMs}`);
              const timer = setTimeout(async () => {
                validationTimers.delete(game._id.toString());
                try {
                  const locked = await Game.findOneAndUpdate(
                    { _id: game._id, status: 'validating', $or: [ { validationInProgress: { $exists: false } }, { validationInProgress: false } ] },
                    { $set: { validationInProgress: true } },
                    { new: true }
                  );
                  if (locked) await runValidation(gameId);
                } catch (e) {
                  console.error('Auto validation error:', e);
                }
              }, waitMs);
              validationTimers.set(game._id.toString(), timer);
            }
          } catch (e) {
            console.error('Round auto-end error:', e);
          }
        }, 60000);
        roundTimers.set(game._id.toString(), rt);
      }, 3000);
      letterRevealTimers.set(game._id.toString(), revTimer);
    } catch (error) {
      console.error('Letter selected socket error:', error);
    }
  });

  // Player stopped
  socket.on('player-stopped', async (data) => {
    try {
      const { gameId } = data;
      const idStr = gameId.toString();
      const User = require('../models/User');
      let username = 'Player';
      try {
        const u = await User.findById(socket.userId).select('username');
        if (u && u.username) username = u.username;
      } catch (e) {}

      // Ensure we only process STOP once per round when game is in 'playing'
      const g = await Game.findById(gameId);
      if (!g || g.status !== 'playing') return;

      // Cancel any round auto-end timer
      try {
        const t = roundTimers.get(idStr);
        if (t) {
          clearTimeout(t);
          roundTimers.delete(idStr);
        }
      } catch (e) {}

      // Transition to validating first to avoid duplicate STOPs racing
      g.status = 'validating';
      const graceMs = parseInt(process.env.VALIDATION_GRACE_MS || '3000');
      g.validationDeadline = new Date(Date.now() + graceMs);
      await g.save();

      // Notify clients
      io.to(`game-${gameId}`).emit('player-stopped', {
        playerId: socket.userId,
        username,
        timestamp: new Date()
      });
      io.to(`game-${gameId}`).emit('round-ended', { reason: 'stopped', validationDeadline: g.validationDeadline });
      const vt = validationTimers.get(idStr);
      if (vt) clearTimeout(vt);
      const allSubmitted = (g.players || []).every(p => (p.answers || []).some(a => a.round === g.currentRound));
      const waitMs = allSubmitted ? 0 : graceMs;
      console.log(`[ROUND END] reason=stopped game=${gameId} round=${g.currentRound} stopper=${username} allSubmitted=${allSubmitted} graceMs=${graceMs} waitMs=${waitMs}`);
      const timer = setTimeout(async () => {
        validationTimers.delete(idStr);
        try {
          const locked = await Game.findOneAndUpdate(
            { _id: gameId, status: 'validating', $or: [ { validationInProgress: { $exists: false } }, { validationInProgress: false } ] },
            { $set: { validationInProgress: true } },
            { new: true }
          );
          if (locked) await runValidation(gameId);
        } catch (e) {
          console.error('Auto validation error:', e);
        }
      }, waitMs);
      validationTimers.set(idStr, timer);
    } catch (error) {
      console.error('Player stopped socket error:', error);
    }
  });

  // Round results
  socket.on('round-results', async (data) => {
    try {
      const { gameId, results } = data;
      
      io.to(`game-${gameId}`).emit('show-results', {
        results,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Round results socket error:', error);
    }
  });

  // Next round readiness
  socket.on('next-round-ready', async (data) => {
    try {
      const { gameId } = data;
      if (!socket.userId) return;
      const id = gameId.toString();
      let set = nextRoundReady.get(id);
      if (!set) {
        set = new Set();
        nextRoundReady.set(id, set);
      }
      set.add(socket.userId.toString());

      const game = await Game.findById(gameId).select('players status');
      if (!game) return;
      const total = (game.players || []).length;
      io.to(`game-${gameId}`).emit('ready-update', { ready: set.size, total });

      // Start 7s countdown if not already
      if (!nextRoundTimers.get(id)) {
        let seconds = 7;
        io.to(`game-${gameId}`).emit('next-round-countdown', { seconds });
        const timer = setInterval(async () => {
          seconds -= 1;
          if (seconds > 0) {
            io.to(`game-${gameId}`).emit('next-round-countdown', { seconds });
          }
          const everyoneReady = set.size >= total;
          if (seconds <= 0 || everyoneReady) {
            clearInterval(timer);
            nextRoundTimers.delete(id);
            nextRoundReady.delete(id);
            await advanceToNextRound(gameId);
          }
        }, 1000);
        nextRoundTimers.set(id, timer);
      } else {
        // If everyone ready, fast-forward
        if (set.size >= total) {
          const t = nextRoundTimers.get(id);
          if (t) {
            clearInterval(t);
            nextRoundTimers.delete(id);
          }
          nextRoundReady.delete(id);
          await advanceToNextRound(gameId);
        }
      }
    } catch (error) {
      console.error('Next round ready socket error:', error);
    }
  });

  async function advanceToNextRound(gameId) {
    try {
      const game = await Game.findById(gameId).populate('players.user', 'username');
      if (!game) return;
      const hasNext = game.nextRound();
      if (hasNext) {
        const selectorId = (game.letterSelector || '').toString();
        const selectorPlayer = (game.players || []).find(p => (p.user._id || p.user).toString() === selectorId);
        const selectorName = selectorPlayer?.user?.username || 'Player';
        const letterDeadline = new Date(Date.now() + 12000);
        game.letterDeadline = letterDeadline;
        await game.save();

        io.to(`game-${gameId}`).emit('letter-selection-started', {
          gameId,
          selectorId,
          selectorName,
          deadline: letterDeadline,
          currentRound: game.currentRound
        });

        const existingL = letterTimers.get(game._id.toString());
        if (existingL) clearTimeout(existingL);
        const selTimer = setTimeout(async () => {
          letterTimers.delete(game._id.toString());
          try {
            const g = await Game.findById(game._id);
            if (g && g.status === 'selecting_letter' && !g.currentLetter) {
              const autoLetter = g.selectRandomLetter();
              g.letterDeadline = null;
              await g.save();

              const revealDeadline = new Date(Date.now() + 3000);
              io.to(`game-${gameId}`).emit('letter-accepted', {
                letter: g.currentLetter,
                revealDeadline
              });

              const existingR = letterRevealTimers.get(game._id.toString());
              if (existingR) clearTimeout(existingR);
              const revTimer = setTimeout(async () => {
                letterRevealTimers.delete(game._id.toString());
                const gg = await Game.findById(game._id);
                if (!gg) return;
                gg.status = 'playing';
                gg.roundStartTime = new Date();
                await gg.save();
                io.to(`game-${gameId}`).emit('letter-selected', {
                  letter: gg.currentLetter
                });
                // start 60s round auto-end timer
                const existingRound = roundTimers.get(game._id.toString());
                if (existingRound) clearTimeout(existingRound);
                const rt = setTimeout(async () => {
                  roundTimers.delete(game._id.toString());
                  try {
                    const g3 = await Game.findById(game._id);
                    if (g3 && g3.status === 'playing') {
                      g3.status = 'validating';
                      const graceMs = parseInt(process.env.VALIDATION_GRACE_MS || '3000');
                      g3.validationDeadline = new Date(Date.now() + graceMs);
                      await g3.save();
                      io.to(`game-${gameId}`).emit('round-ended', { reason: 'timeout', validationDeadline: g3.validationDeadline });
                      const vt = validationTimers.get(game._id.toString());
                      if (vt) clearTimeout(vt);
                      const allSubmitted = (g3.players || []).every(p => (p.answers || []).some(a => a.round === g3.currentRound));
                      const waitMs = allSubmitted ? 0 : graceMs;
                      console.log(`[ROUND END] reason=timeout game=${gameId} round=${g3.currentRound} allSubmitted=${allSubmitted} graceMs=${graceMs} waitMs=${waitMs}`);
                      const timer = setTimeout(async () => {
                        validationTimers.delete(game._id.toString());
                        try {
                          const locked = await Game.findOneAndUpdate(
                            { _id: game._id, status: 'validating', $or: [ { validationInProgress: { $exists: false } }, { validationInProgress: false } ] },
                            { $set: { validationInProgress: true } },
                            { new: true }
                          );
                          if (locked) await runValidation(gameId);
                        } catch (e) {
                          console.error('Auto validation error:', e);
                        }
                      }, waitMs);
                      validationTimers.set(game._id.toString(), timer);
                    }
                  } catch (e) {
                    console.error('Round auto-end error:', e);
                  }
                }, 60000);
                roundTimers.set(game._id.toString(), rt);
              }, 3000);
              letterRevealTimers.set(game._id.toString(), revTimer);
            }
          } catch (e) {
            console.error('Auto-pick letter error:', e);
          }
        }, 12000);
        letterTimers.set(game._id.toString(), selTimer);
      } else {
        // Update room status and user stats when game finishes
        try {
          const standings = game.getStandings();
          const Room = require('../models/Room');
          const room = await Room.findById(game.room);
          if (room) {
            room.status = 'waiting';
            room.currentGame = null;
            await room.save();
          }
          // Emit final standings and winner to all players in the current game
          io.to(`game-${gameId}`).emit('game-finished', {
            winner: (game.winner || null),
            standings
          });
        } catch (e) {
          console.error('Finalize game finish error:', e);
          io.to(`game-${gameId}`).emit('game-finished', {
            winner: (game.winner || null)
          });
        }
      }
    } catch (err) {
      console.error('Advance to next round error:', err);
    }
  }

  // Delete room
  socket.on('delete-room', async (roomId) => {
    try {
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const room = await Room.findById(roomId);
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      // Only owner can delete room
      if (room.owner.toString() !== socket.userId.toString()) {
        return socket.emit('error', { message: 'Only owner can delete room' });
      }

      // Notify all players in the room
      io.to(roomId).emit('room-deleted', {
        message: 'Host terminated the session'
      });

      // Delete the room from database
      await room.deleteOne();

      // Make all sockets leave the room
      const socketsInRoom = await io.in(roomId).fetchSockets();
      for (const s of socketsInRoom) {
        s.leave(roomId);
        s.roomId = null;
      }
    } catch (error) {
      console.error('Delete room socket error:', error);
      socket.emit('error', { message: 'Failed to delete room' });
    }
  });

  // Chat message
  socket.on('chat-message', async (data) => {
    try {
      const { roomId, message } = data;
      
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const User = require('../models/User');
      const user = await User.findById(socket.userId).select('username');

      // Emit to all users including sender, with username
      io.to(roomId).emit('new-message', {
        userId: socket.userId,
        username: user?.username || 'Player',
        message,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Chat message socket error:', error);
    }
  });

  // Disconnect (atomic updates)
  socket.on('disconnect', async () => {
    try {
      // Clean up quick play queue
      if (quickPlayQueue.has(socket.id)) {
        quickPlayQueue.delete(socket.id);
        socket.quickPlayUserId = null;
        console.log(`[DISCONNECT] User removed from quick play queue. Queue size: ${quickPlayQueue.size}`);
      }

      if (!(socket.roomId && socket.userId)) return;

      const roomIdToCleanup = socket.roomId;
      const User = require('../models/User');
      const user = await User.findById(socket.userId);
      const username = user?.username || 'Player';

      console.log(`[DISCONNECT] User ${socket.userId} (${username}) disconnected from room ${roomIdToCleanup}`);

      const roomBefore = await Room.findById(socket.roomId).select('owner players')
        .populate('players.user', 'username winPoints');
      if (!roomBefore) {
        console.log(`[DISCONNECT] Room ${socket.roomId} not found`);
        return;
      }

      const wasOwner = roomBefore.owner.toString() === socket.userId.toString();

      let room = await Room.findOneAndUpdate(
        { _id: socket.roomId },
        { $pull: { players: { user: socket.userId } } },
        { new: true }
      ).populate('players.user', 'username winPoints');

      if (!room) return;

      console.log(`[DISCONNECT] After removal, room ${room._id} has ${room.players.length} player(s)`);

      // Abort any ongoing rematch readiness for this room
      try {
        rematchReady.delete(roomIdToCleanup.toString());
        const t = rematchCountdownTimers.get(roomIdToCleanup.toString());
        if (t) {
          clearInterval(t);
          rematchCountdownTimers.delete(roomIdToCleanup.toString());
        }
        io.to(roomIdToCleanup).emit('rematch-aborted', { reason: 'player-left' });
      } catch (e) {
        console.error('[DISCONNECT] Error aborting rematch:', e);
      }

      if (room.players.length === 0) {
        console.log(`[DISCONNECT] Room is empty, calling cleanup`);
        await cleanupEmptyRoom(room._id);
        return;
      }

      // Room still has players
      if (wasOwner) {
        const next = room.players[0];
        const newOwnerId = (next.user._id || next.user).toString();
        console.log(`[DISCONNECT] Transferring ownership to ${newOwnerId}`);
        
        await Room.updateOne(
          { _id: room._id },
          { $set: { owner: newOwnerId, 'players.$[elem].isReady': true } },
          { arrayFilters: [ { 'elem.user': next.user._id || next.user } ] }
        );
        room = await Room.findById(room._id).populate('players.user', 'username winPoints');

        io.to(roomIdToCleanup).emit('ownership-transferred', {
          newOwnerId,
          players: room.players,
          username: next.user.username || 'Player',
          inviteCode: room.inviteCode
        });
      }

      io.to(roomIdToCleanup).emit('player-left', {
        roomId: roomIdToCleanup,
        players: room.players,
        username,
        newOwnerId: wasOwner && room.players.length > 0 ? (room.players[0].user._id || room.players[0].user).toString() : null
      });
    } catch (error) {
      console.error('Disconnect socket error:', error);
    }
  });

  // Rematch readiness: all players must opt-in to start a new game in same room
  socket.on('play-again-ready', async (data) => {
    try {
      const { gameId } = data || {};
      if (!socket.userId || !gameId) return;
      const game = await Game.findById(gameId).select('room players status');
      if (!game) return;
      const roomId = game.room.toString();
      let set = rematchReady.get(roomId);
      if (!set) {
        set = new Set();
        rematchReady.set(roomId, set);
      }
      set.add(socket.userId.toString());

      const total = (game.players || []).length;
      // Inform current game room about rematch readiness
      io.to(`game-${gameId}`).emit('rematch-update', { ready: set.size, total });

      if (set.size >= total) {
        // Start a 5-second countdown if not already running
        if (!rematchCountdownTimers.get(roomId)) {
          let seconds = 5;
          io.to(`game-${gameId}`).emit('rematch-countdown', { seconds });
          const timer = setInterval(async () => {
            seconds -= 1;
            if (seconds > 0) {
              io.to(`game-${gameId}`).emit('rematch-countdown', { seconds });
              return;
            }
            // Countdown finished
            clearInterval(timer);
            rematchCountdownTimers.delete(roomId);
            rematchReady.delete(roomId);

            // Recreate game using existing room and original player order
            try {
              const Room = require('../models/Room');
              const room = await Room.findById(roomId).populate('players.user');
              if (!room) return;
  
              // Load previous game to copy categories
              const prevGame = await Game.findById(gameId).select('categories');
              const startingSelector = (room.players[0].user._id || room.players[0].user);

              const newGame = new Game({
                room: room._id,
                rounds: room.rounds,
                players: room.players.map(p => ({
                  user: p.user._id || p.user,
                  score: 0,
                  answers: []
                })),
                categories: Array.isArray(prevGame?.categories) ? prevGame.categories : [],
                letterSelector: startingSelector,
                currentRound: 1,
                status: 'selecting_letter'
              });
              newGame.categoryDeadline = null;
              newGame.confirmedPlayers = [];
              newGame.categoryReadyPlayers = [];
              // set initial 12s letter selection deadline so join-game will push the event
              newGame.letterDeadline = new Date(Date.now() + 12000);
              await newGame.save();
  
              room.status = 'in_progress';
              room.currentGame = newGame._id;
              await room.save();
  
              // Notify both the room and the old game room to transition to gameplay
              const payload = { roomId, gameId: newGame._id, countdown: 0 };
              io.to(roomId).emit('game-starting', payload);
              io.to(`game-${gameId}`).emit('game-starting', payload);
              // Also emit directly to every socket found in either room to avoid any missed events
              try {
                const socketsInRoom = await io.in(roomId).fetchSockets();
                const socketsInOldGame = await io.in(`game-${gameId}`).fetchSockets();
                const uniq = new Set();
                [...socketsInRoom, ...socketsInOldGame].forEach(s => {
                  if (s && !uniq.has(s.id)) {
                    uniq.add(s.id);
                    s.emit('game-starting', payload);
                  }
                });
              } catch (e) {
                console.error('Direct emit to sockets for rematch failed:', e);
              }
              setTimeout(async () => {
                io.to(roomId).emit('game-starting', payload);
                io.to(`game-${gameId}`).emit('game-starting', payload);
                try {
                  const socketsInRoom2 = await io.in(roomId).fetchSockets();
                  const socketsInOldGame2 = await io.in(`game-${gameId}`).fetchSockets();
                  const uniq2 = new Set();
                  [...socketsInRoom2, ...socketsInOldGame2].forEach(s => {
                    if (s && !uniq2.has(s.id)) {
                      uniq2.add(s.id);
                      s.emit('game-starting', payload);
                    }
                  });
                } catch (e2) {
                  console.error('Direct emit retry failed:', e2);
                }
              }, 500);

              // Immediately announce letter selection for new game and start 12s timer
              try {
                const selectorId = (newGame.letterSelector || '').toString();
                const selectorPlayer = room.players.find(p => (p.user._id || p.user).toString() === selectorId);
                const selectorName = selectorPlayer?.user?.username || 'Player';
                const letterDeadline = newGame.letterDeadline;
                io.to(roomId).emit('letter-selection-started', {
                  gameId: newGame._id,
                  selectorId,
                  selectorName,
                  deadline: letterDeadline,
                  currentRound: newGame.currentRound
                });
                io.to(`game-${newGame._id}`).emit('letter-selection-started', {
                  gameId: newGame._id,
                  selectorId,
                  selectorName,
                  deadline: letterDeadline,
                  currentRound: newGame.currentRound
                });

                // Schedule auto-pick after 12s
                const existingL = letterTimers.get(newGame._id.toString());
                if (existingL) clearTimeout(existingL);
                const selTimer = setTimeout(async () => {
                  letterTimers.delete(newGame._id.toString());
                  try {
                    const g = await Game.findById(newGame._id);
                    if (g && g.status === 'selecting_letter' && !g.currentLetter) {
                      const autoLetter = g.selectRandomLetter();
                      g.letterDeadline = null;
                      await g.save();

                      const revealDeadline = new Date(Date.now() + 3000);
                      io.to(`game-${g._id}`).emit('letter-accepted', {
                        letter: g.currentLetter,
                        revealDeadline
                      });

                      const existingR = letterRevealTimers.get(g._id.toString());
                      if (existingR) clearTimeout(existingR);
                      const revTimer = setTimeout(async () => {
                        letterRevealTimers.delete(g._id.toString());
                        const gg = await Game.findById(g._id);
                        if (!gg) return;
                        gg.status = 'playing';
                        gg.roundStartTime = new Date();
                        await gg.save();
                        io.to(`game-${gg._id}`).emit('letter-selected', {
                          letter: gg.currentLetter
                        });
                        // start 60s round auto-end timer
                        const existingRound = roundTimers.get(gg._id.toString());
                        if (existingRound) clearTimeout(existingRound);
                        const rt = setTimeout(async () => {
                          roundTimers.delete(gg._id.toString());
                          try {
                            const g3 = await Game.findById(gg._id);
                            if (g3 && g3.status === 'playing') {
                              g3.status = 'validating';
                              const graceMs = parseInt(process.env.VALIDATION_GRACE_MS || '3000');
                              g3.validationDeadline = new Date(Date.now() + graceMs);
                              await g3.save();
                              io.to(`game-${g3._id}`).emit('round-ended', { reason: 'timeout', validationDeadline: g3.validationDeadline });
                              const vt = validationTimers.get(g3._id.toString());
                              if (vt) clearTimeout(vt);
                              const allSubmitted = (g3.players || []).every(p => (p.answers || []).some(a => a.round === g3.currentRound));
                              const waitMs = allSubmitted ? 0 : graceMs;
                              console.log(`[ROUND END] reason=timeout game=${g3._id} round=${g3.currentRound} allSubmitted=${allSubmitted} graceMs=${graceMs} waitMs=${waitMs}`);
                              const timer = setTimeout(async () => {
                                validationTimers.delete(g3._id.toString());
                                try {
                                  const locked = await Game.findOneAndUpdate(
                                    { _id: g3._id, status: 'validating', $or: [ { validationInProgress: { $exists: false } }, { validationInProgress: false } ] },
                                    { $set: { validationInProgress: true } },
                                    { new: true }
                                  );
                                  if (locked) await runValidation(g3._id.toString());
                                } catch (e) {
                                  console.error('Auto validation error:', e);
                                }
                              }, waitMs);
                              validationTimers.set(g3._id.toString(), timer);
                            }
                          } catch (e) {
                            console.error('Round auto-end error:', e);
                          }
                        }, 60000);
                        roundTimers.set(gg._id.toString(), rt);
                      }, 3000);
                      letterRevealTimers.set(g._id.toString(), revTimer);
                    }
                  } catch (e) {
                    console.error('Auto-pick letter error (rematch):', e);
                  }
                }, 12000);
                letterTimers.set(newGame._id.toString(), selTimer);
              } catch (e) {
                console.error('Emit initial letter-selection for rematch error:', e);
              }
            } catch (err) {
              console.error('Rematch create game error:', err);
              io.to(`game-${gameId}`).emit('rematch-aborted', { reason: 'server-error' });
            }
          }, 1000);
          rematchCountdownTimers.set(roomId, timer);
        }
      }
    } catch (error) {
      console.error('Play again ready socket error:', error);
    }
  });

  // Quick Play: Join matchmaking queue
  socket.on('quickplay-join', async () => {
    try {
      if (!socket.userId) {
        socket.emit('quickplay-error', { message: 'Not authenticated' });
        return;
      }

      console.log(`[QUICKPLAY] User ${socket.userId} joining queue`);

      // First, check if there are any available public rooms
      const Room = require('../models/Room');
      const availableRooms = await Room.find({
        isPublic: true,
        status: 'waiting',
        $expr: { $lt: [{ $size: '$players' }, '$maxPlayers'] }
      }).populate('players.user owner', 'username').limit(1);

      if (availableRooms.length > 0) {
        // Join the first available public room
        const room = availableRooms[0];
        console.log(`[QUICKPLAY] Found existing room ${room._id} for user ${socket.userId}`);
        
        // Check if user is already in the room
        const alreadyInRoom = room.players.some(p => (p.user._id || p.user).toString() === socket.userId.toString());
        if (!alreadyInRoom) {
          room.players.push({ user: socket.userId, isReady: false });
          await room.save();
        }

        socket.emit('quickplay-matched', { roomId: room._id.toString() });
        return;
      }

      // No available rooms, add to queue
      quickPlayQueue.add(socket.id);
      socket.quickPlayUserId = socket.userId;
      console.log(`[QUICKPLAY] Added to queue. Queue size: ${quickPlayQueue.size}`);

      // Check if we have enough players to create a room
      const minPlayers = parseInt(process.env.QUICKPLAY_MIN_PLAYERS || '2');
      if (quickPlayQueue.size >= minPlayers) {
        console.log(`[QUICKPLAY] Enough players (${quickPlayQueue.size}/${minPlayers}), creating room...`);

        // Get the first N players from the queue
        const selectedSockets = Array.from(quickPlayQueue).slice(0, minPlayers);
        const sockets = [];
        
        for (const socketId of selectedSockets) {
          const s = io.sockets.sockets.get(socketId);
          if (s && s.quickPlayUserId) {
            sockets.push(s);
          }
        }

        if (sockets.length >= minPlayers) {
          // Create a new public room
          const owner = sockets[0].quickPlayUserId;
          const newRoom = new Room({
            name: `Quick Play Room`,
            owner,
            isPublic: true,
            maxPlayers: 8,
            rounds: 3,
            hasPassword: false,
            players: sockets.map(s => ({ user: s.quickPlayUserId, isReady: s.quickPlayUserId.toString() === owner.toString() }))
          });
          await newRoom.save();
          const roomId = newRoom._id.toString();

          console.log(`[QUICKPLAY] Created room ${roomId} with ${sockets.length} players`);

          // Remove matched players from queue
          for (const s of sockets) {
            quickPlayQueue.delete(s.id);
            s.quickPlayUserId = null;
          }

          // Notify all matched players
          for (const s of sockets) {
            s.emit('quickplay-matched', { roomId });
          }
        }
      }
    } catch (error) {
      console.error('Quick play join error:', error);
      socket.emit('quickplay-error', { message: 'Failed to join quick play' });
    }
  });

  // Quick Play: Leave matchmaking queue
  socket.on('quickplay-leave', () => {
    if (quickPlayQueue.has(socket.id)) {
      quickPlayQueue.delete(socket.id);
      socket.quickPlayUserId = null;
      console.log(`[QUICKPLAY] User left queue. Queue size: ${quickPlayQueue.size}`);
    }
  });
};
