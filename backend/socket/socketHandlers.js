const Room = require('../models/Room');
const Game = require('../models/Game');
const User = require('../models/User');
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
const quickPlayQueueByLanguage = new Map(); // Map<language, Set<socketId>>
const roundAdvancementLocks = new Map(); // Prevent concurrent round advancement
const abandonedGameCleanupTimers = new Map();
const appBackgroundTimers = new Map();
const roomBackgroundTimers = new Map();
const activeUserSockets = new Map();

const TTL_15_MIN_MS = 15 * 60 * 1000;
const VALIDATION_LOCK_STALE_MS = parseInt(process.env.VALIDATION_LOCK_STALE_MS || '30000');

module.exports = (io, socket) => {
  const emitOnlineCount = (target) => {
    try {
      const payload = { count: activeUserSockets.size };
      if (target && typeof target.emit === 'function') {
        target.emit('online-count', payload);
        return;
      }
      io.emit('online-count', payload);
    } catch (e) {
      // best-effort
    }
  };

  // Helper to clean up empty rooms - CRITICAL for preventing orphaned rooms
  const cleanupEmptyRoom = async (roomId) => {
    try {
      if (!roomId) return false;
      
      const room = await Room.findById(roomId).select('players name status currentGame');
      if (!room) {
        console.log(`[ROOM CLEANUP] Room ${roomId} not found (already deleted)`);
        return false;
      }
      
      if (room.players.length === 0) {
        console.log(`[ROOM CLEANUP] Deleting empty room: ${roomId} (${room.name}) with status: ${room.status}`);
        
        // If room has an associated game, delete it too
        if (room.currentGame) {
          const Game = require('../models/Game');
          console.log(`[ROOM CLEANUP] Deleting associated game: ${room.currentGame}`);
          clearGameTimers(room.currentGame);
          await Game.deleteOne({ _id: room.currentGame });
        }
        
        await Room.deleteOne({ _id: roomId });
        
        // Clean up any associated timers
        rematchReady.delete(roomId.toString());
        const rematchTimer = rematchCountdownTimers.get(roomId.toString());
        if (rematchTimer) {
          clearInterval(rematchTimer);
          rematchCountdownTimers.delete(roomId.toString());
        }

        // Notify any lingering sockets that the room has been dissolved
        try {
          const roomIdStr = roomId.toString();
          io.to(roomIdStr).emit('room-deleted', {
            message: 'Room is Disolved'
          });
          const socketsInRoom = await io.in(roomIdStr).fetchSockets();
          for (const s of socketsInRoom) {
            s.leave(roomIdStr);
            s.roomId = null;
          }
        } catch (e) {
          console.error('[ROOM CLEANUP] Error notifying sockets about dissolved room:', e);
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

  // Centralized function to clear all timers for a game
  const clearGameTimers = (gameId) => {
    const id = gameId.toString();

    // Clear category selection timer
    const ct = categoryTimers.get(id);
    if (ct) {
      clearTimeout(ct);
      categoryTimers.delete(id);
      console.log(`[TIMER CLEANUP] Cleared category timer for game ${id}`);
    }
    
    // Clear letter selection timer
    const lt = letterTimers.get(id);
    if (lt) {
      clearTimeout(lt);
      letterTimers.delete(id);
      console.log(`[TIMER CLEANUP] Cleared letter timer for game ${id}`);
    }
    
    // Clear letter reveal timer
    const rt = letterRevealTimers.get(id);
    if (rt) {
      clearTimeout(rt);
      letterRevealTimers.delete(id);
      console.log(`[TIMER CLEANUP] Cleared letter reveal timer for game ${id}`);
    }
    
    // Clear round timer
    const rnd = roundTimers.get(id);
    if (rnd) {
      clearTimeout(rnd);
      roundTimers.delete(id);
      console.log(`[TIMER CLEANUP] Cleared round timer for game ${id}`);
    }

    // Clear validation timer
    const vt = validationTimers.get(id);
    if (vt) {
      clearTimeout(vt);
      validationTimers.delete(id);
      console.log(`[TIMER CLEANUP] Cleared validation timer for game ${id}`);
    }

    // Clear next round countdown timer
    const nrt = nextRoundTimers.get(id);
    if (nrt) {
      clearInterval(nrt);
      nextRoundTimers.delete(id);
      console.log(`[TIMER CLEANUP] Cleared next-round timer for game ${id}`);
    }

    // Clear next round ready tracking
    if (nextRoundReady.get(id)) {
      nextRoundReady.delete(id);
    }

    // Clear any round advancement lock
    if (roundAdvancementLocks.get(id)) {
      roundAdvancementLocks.delete(id);
    }
  };

  const ABANDONED_GAME_CLEANUP_MS = 20000;

  const cancelAbandonedGameCleanup = (gameId) => {
    try {
      const id = gameId.toString();
      const t = abandonedGameCleanupTimers.get(id);
      if (t) {
        clearTimeout(t);
        abandonedGameCleanupTimers.delete(id);
        console.log(`[ABANDONED GAME] Canceled scheduled cleanup for game ${id}`);
      }
    } catch (e) {
      console.error('[ABANDONED GAME] Failed to cancel cleanup timer:', e);
    }
  };

  const scheduleAbandonedGameCleanup = (gameId, roomId) => {
    try {
      const id = gameId.toString();
      if (abandonedGameCleanupTimers.get(id)) return;

      console.log(`[ABANDONED GAME] Scheduling cleanup for game ${id} in ${ABANDONED_GAME_CLEANUP_MS}ms`);
      const timer = setTimeout(async () => {
        abandonedGameCleanupTimers.delete(id);

        try {
          const g = await Game.findById(id).select('status players room');
          if (!g) {
            console.log(`[ABANDONED GAME] Game ${id} not found at cleanup time`);
            return;
          }

          if (g.status === 'finished') {
            console.log(`[ABANDONED GAME] Game ${id} is finished, skipping abandoned cleanup`);
            return;
          }

          const players = Array.isArray(g.players) ? g.players : [];
          const allDisconnected = players.length > 0 && players.every(p => p.disconnected);
          if (!allDisconnected) {
            console.log(`[ABANDONED GAME] Cleanup aborted for game ${id} (a player reconnected)`);
            return;
          }

          const roomIdFinal = (g.room || roomId || '').toString();
          console.log(`[ABANDONED GAME] Deleting abandoned game ${id} and room ${roomIdFinal}`);

          clearGameTimers(id);
          await Game.deleteOne({ _id: id });
          if (roomIdFinal) {
            rematchReady.delete(roomIdFinal);
            const rt = rematchCountdownTimers.get(roomIdFinal);
            if (rt) {
              clearInterval(rt);
              rematchCountdownTimers.delete(roomIdFinal);
            }
            await Room.deleteOne({ _id: roomIdFinal });
          }
        } catch (err) {
          console.error(`[ABANDONED GAME] Error cleaning up game ${id}:`, err);
        }
      }, ABANDONED_GAME_CLEANUP_MS);

      abandonedGameCleanupTimers.set(id, timer);
    } catch (e) {
      console.error('[ABANDONED GAME] Failed to schedule cleanup:', e);
    }
  };

  // Centralized letter selection starter - ensures letter is ALWAYS selected (manual or auto)
  const startLetterSelection = async (game) => {
    try {
      const gameId = game._id.toString();
      console.log(`[LETTER SELECTION] Starting for game ${gameId}, round ${game.currentRound}`);
      
      // Clear any existing timers first
      clearGameTimers(gameId);
      
      // Set up letter selection deadline
      const selectorId = (game.letterSelector || '').toString();
      const selectorPlayer = game.players.find(p => (p.user._id || p.user).toString() === selectorId);
      const selectorName = selectorPlayer?.user?.displayName || selectorPlayer?.user?.username || 'Player';
      const letterDeadline = new Date(Date.now() + 12000);
      game.letterDeadline = letterDeadline;
      game.status = 'selecting_letter';
      await game.save();

      // Emit letter selection started event
      io.to(`game-${gameId}`).emit('letter-selection-started', {
        gameId,
        selectorId,
        selectorName,
        deadline: letterDeadline,
        currentRound: game.currentRound
      });

      console.log(`[LETTER SELECTION] Timer set for game ${gameId}, selector: ${selectorName}, deadline: 12s`);

      // Schedule auto-pick after 12s if not chosen
      const selTimer = setTimeout(async () => {
        letterTimers.delete(gameId);
        try {
          const g = await Game.findById(gameId);
          if (!g) {
            console.log(`[LETTER AUTO-PICK] Game ${gameId} not found`);
            return;
          }
          
          // Only auto-pick if still in letter selection and no letter chosen
          if (g.status === 'selecting_letter' && !g.currentLetter) {
            console.log(`[LETTER AUTO-PICK] Auto-selecting letter for game ${gameId}, round ${g.currentRound}`);
            const autoLetter = g.selectRandomLetter();
            g.letterDeadline = null;
            await g.save();
            console.log(`[LETTER AUTO-PICK] Selected letter ${autoLetter} for game ${gameId}`);

            // Proceed to reveal phase
            await proceedWithLetterReveal(gameId, g.currentLetter);
          } else {
            console.log(`[LETTER AUTO-PICK] Skipped for game ${gameId} - status: ${g.status}, letter: ${g.currentLetter}`);
          }
        } catch (e) {
          console.error(`[LETTER AUTO-PICK] Error for game ${gameId}:`, e);
        }
      }, 12000);
      
      letterTimers.set(gameId, selTimer);
    } catch (error) {
      console.error('[LETTER SELECTION] Start error:', error);
    }
  };

  // Helper to proceed with letter reveal and start round
  const proceedWithLetterReveal = async (gameId, letter) => {
    try {
      console.log(`[LETTER REVEAL] Starting for game ${gameId}, letter: ${letter}`);
      
      const revealDeadline = new Date(Date.now() + 3000);
      io.to(`game-${gameId}`).emit('letter-accepted', {
        gameId,
        letter: letter,
        revealDeadline
      });

      // Clear any existing reveal timer
      const existingR = letterRevealTimers.get(gameId);
      if (existingR) clearTimeout(existingR);
      
      const revTimer = setTimeout(async () => {
        letterRevealTimers.delete(gameId);
        try {
          const gg = await Game.findById(gameId);
          if (!gg) {
            console.log(`[LETTER REVEAL] Game ${gameId} not found`);
            return;
          }
          
          gg.status = 'playing';
          gg.roundStartTime = new Date();
          await gg.save();
          
          console.log(`[ROUND START] Game ${gameId}, round ${gg.currentRound}, letter: ${letter}`);
          
          io.to(`game-${gameId}`).emit('letter-selected', {
            gameId,
            letter: gg.currentLetter
          });
          
          // Start 60s round timer
          const existingRound = roundTimers.get(gameId);
          if (existingRound) clearTimeout(existingRound);
          
          const rt = setTimeout(async () => {
            roundTimers.delete(gameId);
            try {
              const g3 = await Game.findById(gameId);
              if (g3 && g3.status === 'playing') {
                console.log(`[ROUND TIMEOUT] Game ${gameId}, round ${g3.currentRound}`);
                g3.status = 'validating';
                const graceMs = parseInt(process.env.VALIDATION_GRACE_MS || '3000');
                g3.validationDeadline = new Date(Date.now() + graceMs);
                await g3.save();
                
                io.to(`game-${gameId}`).emit('round-ended', { 
                  gameId,
                  reason: 'timeout', 
                  validationDeadline: g3.validationDeadline 
                });
                try {
                  const roomId = g3.room ? g3.room.toString() : null;
                  if (roomId) {
                    io.to(roomId).emit('round-ended', { 
                      gameId,
                      reason: 'timeout', 
                      validationDeadline: g3.validationDeadline 
                    });
                  }
                } catch (e) {}

                // Schedule validation
                const vt = validationTimers.get(gameId);
                if (vt) clearTimeout(vt);
                
                const allSubmitted = (g3.players || []).every(p => 
                  (p.answers || []).some(a => a.round === g3.currentRound)
                );
                const waitMs = allSubmitted ? 0 : graceMs;
                
                console.log(`[ROUND END] Game=${gameId} Round=${g3.currentRound} AllSubmitted=${allSubmitted} WaitMs=${waitMs}`);
                
                const timer = setTimeout(async () => {
                  validationTimers.delete(gameId);
                  try {
                    const now = new Date();
                    const staleBefore = new Date(Date.now() - VALIDATION_LOCK_STALE_MS);
                    const locked = await Game.findOneAndUpdate(
                      { 
                        _id: gameId, 
                        status: 'validating', 
                        $or: [
                          { validationInProgress: { $exists: false } }, 
                          { validationInProgress: false },
                          {
                            validationInProgress: true,
                            $or: [
                              { validationStartedAt: { $exists: false } },
                              { validationStartedAt: null },
                              { validationStartedAt: { $lt: staleBefore } }
                            ]
                          }
                        ] 
                      },
                      { $set: { validationInProgress: true, validationStartedAt: now } },
                      { new: true }
                    );
                    if (locked) {
                      await runValidation(gameId);
                    } else {
                      console.log(`[VALIDATION] Lock failed for game ${gameId}`);
                    }
                  } catch (e) {
                    console.error('[VALIDATION] Auto validation error:', e);
                  }
                }, waitMs);
                
                validationTimers.set(gameId, timer);
              }
            } catch (e) {
              console.error('[ROUND TIMEOUT] Error:', e);
            }
          }, 60000);
          
          roundTimers.set(gameId, rt);
        } catch (e) {
          console.error('[LETTER REVEAL] Error:', e);
        }
      }, 3000);
      
      letterRevealTimers.set(gameId, revTimer);
    } catch (error) {
      console.error('[LETTER REVEAL] Error:', error);
    }
  };

  // Helper function to handle letter selector disconnect - pass turn to next connected player
  const handleLetterSelectorDisconnect = async (game, gameId) => {
    try {
      // Clear existing letter timer
      clearGameTimers(gameId);

      // Find next connected player to be letter selector
      const currentSelectorId = (game.letterSelector || '').toString();
      const playerIds = game.players.map(p => (p.user._id || p.user).toString());
      let currentIndex = playerIds.indexOf(currentSelectorId);
      if (currentIndex < 0) currentIndex = 0;

      let nextIndex = currentIndex;
      let attempts = 0;
      const maxAttempts = game.players.length;

      // Find next connected player
      do {
        nextIndex = (nextIndex + 1) % game.players.length;
        attempts++;
        const nextPlayer = game.players[nextIndex];
        if (!nextPlayer.disconnected) {
          break;
        }
      } while (attempts < maxAttempts);

      // If all players disconnected, auto-pick letter
      if (attempts >= maxAttempts || game.players[nextIndex].disconnected) {
        console.log(`[LETTER SELECTOR DISCONNECT] All players disconnected, auto-picking letter`);
        const autoLetter = game.selectRandomLetter();
        game.letterDeadline = null;
        await game.save();
        await proceedWithLetterReveal(gameId, autoLetter);
        return;
      }

      // Set new letter selector
      const newSelector = game.players[nextIndex];
      const newSelectorId = (newSelector.user._id || newSelector.user).toString();
      const newSelectorName = newSelector.user.displayName || newSelector.user.username || 'Player';

      console.log(`[LETTER SELECTOR DISCONNECT] Passing turn to ${newSelectorName} (${newSelectorId})`);

      game.letterSelector = newSelector.user._id || newSelector.user;
      await game.save();

      // Start new letter selection with fresh timer
      await startLetterSelection(game);
    } catch (error) {
      console.error('[LETTER SELECTOR DISCONNECT] Error:', error);
      // Fallback: auto-pick letter
      try {
        const g = await Game.findById(gameId);
        if (g && g.status === 'selecting_letter' && !g.currentLetter) {
          const autoLetter = g.selectRandomLetter();
          g.letterDeadline = null;
          await g.save();
          await proceedWithLetterReveal(gameId, autoLetter);
        }
      } catch (e) {
        console.error('[LETTER SELECTOR DISCONNECT] Fallback error:', e);
      }
    }
  };

  // Helper to finalize categories for a game (dedupe, fill to min 6, cap at 8)
  const finalizeCategories = async (gameId) => {
    try {
      const game = await Game.findById(gameId).populate('players.user', 'username displayName');
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
        gameId,
        categories: game.categories,
        currentPlayer: (game.letterSelector || '').toString()
      });

      // Immediately start letter selection phase with 12s deadline
      const selectorId = (game.letterSelector || '').toString();
      const selectorPlayer = game.players.find(p => (p.user._id || p.user).toString() === selectorId);
      const selectorName = selectorPlayer?.user?.displayName || selectorPlayer?.user?.username || 'Player';
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
              gameId,
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
                gameId,
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
                    io.to(`game-${gameId}`).emit('round-ended', { gameId, reason: 'timeout', validationDeadline: g3.validationDeadline });
                    try {
                      const roomId = g3.room ? g3.room.toString() : null;
                      if (roomId) {
                        io.to(roomId).emit('round-ended', { gameId, reason: 'timeout', validationDeadline: g3.validationDeadline });
                      }
                    } catch (e) {}
                    const vt = validationTimers.get(game._id.toString());
                    if (vt) clearTimeout(vt);
                    const allSubmitted = (g3.players || []).every(p => (p.answers || []).some(a => a.round === g3.currentRound));
                    const waitMs = allSubmitted ? 0 : graceMs;
                    console.log(`[ROUND END] reason=timeout game=${gameId} round=${g3.currentRound} allSubmitted=${allSubmitted} graceMs=${graceMs} waitMs=${waitMs}`);
                    const timer = setTimeout(async () => {
                      validationTimers.delete(game._id.toString());
                      try {
                        const now = new Date();
                        const staleBefore = new Date(Date.now() - VALIDATION_LOCK_STALE_MS);
                        const locked = await Game.findOneAndUpdate(
                          {
                            _id: game._id,
                            status: 'validating',
                            $or: [
                              { validationInProgress: { $exists: false } },
                              { validationInProgress: false },
                              {
                                validationInProgress: true,
                                $or: [
                                  { validationStartedAt: { $exists: false } },
                                  { validationStartedAt: null },
                                  { validationStartedAt: { $lt: staleBefore } }
                                ]
                              }
                            ]
                          },
                          { $set: { validationInProgress: true, validationStartedAt: now } },
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
      const game = await Game.findById(gameId).populate('players.user', 'username displayName');
      if (!game || game.status !== 'validating') {
        try {
          await Game.updateOne({ _id: gameId }, { $set: { validationInProgress: false, validationStartedAt: null } });
        } catch (e) {}
        return;
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

      const resultByKey = await validateBatchAnswersFast(
        unique.map(u => ({ category: u.category, answer: u.answer })),
        game.currentLetter,
        { language: game.language || 'en' }
      );
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
      game.validationStartedAt = null;
      game.validationDeadline = null;
      await game.save();

      try {
        if (game.room) {
          await Room.updateOne(
            { _id: game.room },
            { $set: { expiresAt: new Date(Date.now() + TTL_15_MIN_MS) } }
          );
        }
      } catch (e) {}
      const standings = game.getStandings();
      const roundResults = game.players.map(p => ({
        user: p.user,
        answers: p.answers.find(a => a.round === game.currentRound)
      }));
      io.to(`game-${gameId}`).emit('round-results', {
        gameId,
        standings,
        results: roundResults,
        currentRound: game.currentRound,
        timestamp: new Date()
      });
      console.log(`[VALIDATION] Completed: game=${gameId}, round=${game.currentRound}, totalPlayers=${game.players.length}, totalAnswerSets=${roundResults.length}, totalTime=${Date.now() - t0}ms`);
    } catch (err) {
      console.error('Socket runValidation error:', err);
      try { await Game.updateOne({ _id: gameId }, { $set: { validationInProgress: false, validationStartedAt: null } }); } catch (e) {}
    }
  };
  // Authenticate socket connection
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;

      try {
        const key = socket.userId.toString();
        const set = activeUserSockets.get(key) || new Set();
        set.add(socket.id);
        activeUserSockets.set(key, set);
      } catch (e) {}

      socket.emit('authenticated', { success: true });
      emitOnlineCount();
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Invalid token' });
    }
  });

  socket.on('online-count-request', () => {
    emitOnlineCount(socket);
  });

  socket.on('room-background', async (data) => {
    try {
      if (!socket.userId) return;
      const roomId = (data && data.roomId) || socket.roomId;
      if (!roomId) return;

      const key = `${socket.userId.toString()}:${roomId.toString()}`;
      const prev = roomBackgroundTimers.get(key);
      if (prev && prev.timer) {
        clearTimeout(prev.timer);
        roomBackgroundTimers.delete(key);
      }

      const backgroundAt = Date.now();
      const leaveMs = parseInt(process.env.ROOM_LOBBY_BACKGROUND_LEAVE_MS || '1000');

      const t = setTimeout(async () => {
        const current = roomBackgroundTimers.get(key);
        if (!current || current.backgroundAt !== backgroundAt) return;
        roomBackgroundTimers.delete(key);

        try {
          const remaining = activeUserSockets.get(socket.userId.toString());
          if (remaining && remaining.size > 0) {
            const hasOtherSocket = Array.from(remaining).some((id) => id !== socket.id);
            if (hasOtherSocket) return;
          }
        } catch (e) {}

        const User = require('../models/User');
        const leavingUser = await User.findById(socket.userId);
        const leavingUsername = leavingUser?.username || 'Player';
        const leavingDisplayName = leavingUser?.displayName || leavingUsername;

        const roomBefore = await Room.findById(roomId).select('owner players currentGame status')
          .populate('players.user', 'username displayName winPoints');
        if (!roomBefore) return;

        if (roomBefore.status !== 'waiting') return;

        const wasOwner = roomBefore.owner.toString() === socket.userId.toString();

        let room = await Room.findOneAndUpdate(
          { _id: roomId },
          { $pull: { players: { user: socket.userId } } },
          { new: true }
        ).populate('players.user', 'username displayName winPoints');

        try { socket.leave(roomId.toString()); } catch (e) {}
        socket.roomId = null;

        if (!room) return;

        if (room.players.length === 0) {
          await cleanupEmptyRoom(room._id);
          return;
        }

        if (wasOwner) {
          const next = room.players[0];
          const newOwnerId = (next.user._id || next.user).toString();

          await Room.updateOne(
            { _id: room._id },
            { $set: { owner: newOwnerId, 'players.$[elem].isReady': true } },
            { arrayFilters: [ { 'elem.user': next.user._id || next.user } ] }
          );
          room = await Room.findById(room._id).populate('players.user', 'username displayName winPoints');

          io.to(roomId.toString()).emit('ownership-transferred', {
            newOwnerId,
            players: room.players,
            username: next.user.username || 'Player',
            displayName: next.user.displayName || next.user.username || 'Player',
            inviteCode: room.inviteCode
          });
        }

        io.to(roomId.toString()).emit('player-left', {
          roomId: roomId.toString(),
          players: room.players,
          username: leavingUsername,
          displayName: leavingDisplayName,
          newOwnerId: wasOwner && room.players.length > 0 ? (room.players[0].user._id || room.players[0].user).toString() : null
        });
      }, leaveMs);

      roomBackgroundTimers.set(key, {
        timer: t,
        backgroundAt,
        socketId: socket.id
      });
    } catch (e) {
      console.error('[ROOM BACKGROUND] Error scheduling lobby leave:', e);
    }
  });

  socket.on('room-foreground', async (data) => {
    try {
      if (!socket.userId) return;
      const roomId = (data && data.roomId) || socket.roomId;
      if (!roomId) return;

      const key = `${socket.userId.toString()}:${roomId.toString()}`;
      const entry = roomBackgroundTimers.get(key);
      if (entry && entry.timer) {
        clearTimeout(entry.timer);
        roomBackgroundTimers.delete(key);
      }
    } catch (e) {
      console.error('[ROOM FOREGROUND] Error clearing lobby leave timer:', e);
    }
  });

  const markPlayerDisconnectedInGame = async (gameId, userId, displayName) => {
    try {
      if (!gameId || !userId) return false;
      const game = await Game.findById(gameId).populate('players.user', 'username displayName');
      if (!game || game.status === 'finished') return false;

      const playerInGame = (game.players || []).find(p => (p.user._id || p.user).toString() === userId.toString());
      if (!playerInGame || playerInGame.disconnected) return false;

      playerInGame.scoreBeforeDisconnect = playerInGame.score;
      playerInGame.disconnected = true;
      await game.save();

      io.to(`game-${gameId}`).emit('player-disconnected', {
        gameId,
        odisconnectedPlayerId: userId.toString(),
        odisconnectedPlayerName: displayName,
        players: game.players.map(p => ({
          odisconnectedPlayerId: (p.user._id || p.user).toString(),
          odisconnectedPlayerName: p.user.displayName || p.user.username || 'Player',
          disconnected: p.disconnected,
          score: p.disconnected ? 0 : p.score
        }))
      });

      if (game.status === 'selecting_letter') {
        const currentSelectorId = (game.letterSelector || '').toString();
        if (currentSelectorId === userId.toString()) {
          await handleLetterSelectorDisconnect(game, gameId);
        }
      }

      const connectedPlayers = game.players.filter(p => !p.disconnected);
      if (game.status === 'finished' || game.status === 'round_ended') {
        const roomId = game.room.toString();
        const set = rematchReady.get(roomId);
        if (set) {
          set.delete(userId.toString());
        }
        io.to(`game-${gameId}`).emit('rematch-update', {
          gameId,
          ready: set ? set.size : 0,
          total: connectedPlayers.length
        });

        if (connectedPlayers.length < 2) {
          rematchReady.delete(roomId);
          const t = rematchCountdownTimers.get(roomId);
          if (t) {
            clearInterval(t);
            rematchCountdownTimers.delete(roomId);
          }
          io.to(`game-${gameId}`).emit('rematch-aborted', { gameId, reason: 'not-enough-players' });
        }
      }

      try {
        if (game.status !== 'finished') {
          const players = Array.isArray(game.players) ? game.players : [];
          const allDisconnectedNow = players.length > 0 && players.every(p => p.disconnected);
          const roomIdToCleanup = (game.room || '').toString();
          if (allDisconnectedNow) {
            scheduleAbandonedGameCleanup(gameId, roomIdToCleanup);
          } else {
            cancelAbandonedGameCleanup(gameId);
          }
        }
      } catch (e) {
        console.error('[APP BACKGROUND] Error checking abandoned-game cleanup:', e);
      }

      return true;
    } catch (e) {
      console.error('[APP BACKGROUND] Failed to mark player disconnected:', e);
      return false;
    }
  };

  const restorePlayerIfDisconnected = async (gameId, userId) => {
    try {
      if (!gameId || !userId) return false;
      const game = await Game.findById(gameId).populate('players.user', 'username displayName');
      if (!game || game.status === 'finished') return false;

      const playerInGame = (game.players || []).find(p => (p.user._id || p.user).toString() === userId.toString());
      if (!playerInGame || !playerInGame.disconnected) return false;

      playerInGame.disconnected = false;
      const restoredScore = playerInGame.scoreBeforeDisconnect || playerInGame.score || 0;
      playerInGame.score = restoredScore;
      playerInGame.scoreBeforeDisconnect = 0;
      await game.save();

      io.to(`game-${gameId}`).emit('player-reconnected', {
        gameId,
        odisconnectedPlayerId: userId.toString(),
        odisconnectedPlayerName: playerInGame.user.displayName || playerInGame.user.username || 'Player',
        restoredScore,
        players: game.players.map(p => ({
          odisconnectedPlayerId: (p.user._id || p.user).toString(),
          odisconnectedPlayerName: p.user.displayName || p.user.username || 'Player',
          disconnected: p.disconnected,
          score: p.score
        }))
      });

      try {
        cancelAbandonedGameCleanup(gameId);
      } catch (e) {}

      return true;
    } catch (e) {
      console.error('[APP FOREGROUND] Failed to restore player:', e);
      return false;
    }
  };

  socket.on('app-background', async (data) => {
    try {
      if (!socket.userId) return;
      const gameId = (data && data.gameId) || socket.gameId;
      if (!gameId) return;
      const key = `${socket.userId.toString()}:${gameId.toString()}`;

      const prev = appBackgroundTimers.get(key);
      if (prev && prev.timer) {
        clearTimeout(prev.timer);
        appBackgroundTimers.delete(key);
      }

      const User = require('../models/User');
      const user = await User.findById(socket.userId);
      const username = user?.username || 'Player';
      const displayName = user?.displayName || username;

      const backgroundAt = Date.now();

      const t = setTimeout(async () => {
        const current = appBackgroundTimers.get(key);
        if (!current || current.backgroundAt !== backgroundAt) return;
        appBackgroundTimers.delete(key);
        await markPlayerDisconnectedInGame(gameId, socket.userId, displayName);
      }, 5000);

      appBackgroundTimers.set(key, {
        timer: t,
        backgroundAt,
        socketId: socket.id
      });
    } catch (e) {
      console.error('[APP BACKGROUND] Error scheduling background disconnect:', e);
    }
  });

  socket.on('app-foreground', async (data) => {
    try {
      if (!socket.userId) return;
      const gameId = (data && data.gameId) || socket.gameId;
      if (!gameId) return;

      const key = `${socket.userId.toString()}:${gameId.toString()}`;
      const entry = appBackgroundTimers.get(key);
      if (entry && entry.timer) {
        clearTimeout(entry.timer);
        appBackgroundTimers.delete(key);
      }

      await restorePlayerIfDisconnected(gameId, socket.userId);
    } catch (e) {
      console.error('[APP FOREGROUND] Error handling foreground:', e);
    }
  });

  // Join room
  socket.on('join-room', async (roomId) => {
    try {
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const User = require('../models/User');
      const user = await User.findById(socket.userId).select('language');

      const rid = roomId?.toString?.() ? roomId.toString() : String(roomId);

      let room = await Room.findById(rid)
        .populate('players.user', 'username displayName winPoints');

      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      const roomLanguage = room.language || 'en';
      const userLanguage = user?.language || 'en';
      if (roomLanguage !== userLanguage) {
        return socket.emit('error', {
          message: 'Room language mismatch',
          roomLanguage
        });
      }

      const alreadyInRoom = room.players.some(p => (p.user._id || p.user).toString() === socket.userId.toString());

      if (!alreadyInRoom && room.status !== 'waiting') {
        return socket.emit('error', { message: 'Game already in progress' });
      }

      if (room.password && !alreadyInRoom) {
        return socket.emit('error', { message: 'Password required' });
      }

      if (!alreadyInRoom && room.status === 'waiting') {
        try {
          room.addPlayer(socket.userId);
          room.expiresAt = new Date(Date.now() + TTL_15_MIN_MS);
          await room.save();
          room = await Room.findById(rid).populate('players.user', 'username displayName winPoints');
        } catch (e) {
          if (e && e.message === 'Room is full') {
            return socket.emit('error', { message: 'Room is full' });
          }
          throw e;
        }
      }

      // Join socket room
      const wasInSocketRoom = socket.rooms && socket.rooms.has && socket.rooms.has(rid);
      if (socket.roomId && socket.roomId.toString() !== rid.toString()) {
        try { socket.leave(socket.roomId.toString()); } catch (e) {}
      }
      socket.join(rid);
      socket.roomId = rid;

      // Notify others in room about the new player
      const joiningPlayer = room.players.find(p => 
        (p.user._id || p.user).toString() === socket.userId.toString()
      );
      
      if (!wasInSocketRoom) {
        socket.to(rid).emit('player-joined', {
          roomId: rid,
          players: room.players,
          username: joiningPlayer?.user?.username || 'Player',
          displayName: joiningPlayer?.user?.displayName || joiningPlayer?.user?.username || 'Player'
        });
      }

      socket.emit('room-joined', {
        roomId: rid,
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
      const displayName = user?.displayName || username;

      console.log(`[LEAVE ROOM] User ${socket.userId} (${username}) leaving room ${roomIdToCleanup}`);

      // Load room to determine ownership and game status before removal
      const roomBefore = await Room.findById(socket.roomId).select('owner players currentGame status')
        .populate('players.user', 'username displayName winPoints');
      if (!roomBefore) {
        console.log(`[LEAVE ROOM] Room ${socket.roomId} not found`);
        socket.roomId = null;
        return;
      }

      const wasOwner = roomBefore.owner.toString() === socket.userId.toString();
      const isGameInProgress = roomBefore.status === 'in_progress' && roomBefore.currentGame;
      const gameIdFromSocket = socket.gameId;

      // Mark player as disconnected in game (covers both in-progress and post-game final screen)
      if (isGameInProgress || gameIdFromSocket) {
        const gameId = isGameInProgress ? roomBefore.currentGame.toString() : gameIdFromSocket.toString();
        console.log(`[LEAVE ROOM] Handling leave for game context (${gameId})`);

        const game = await Game.findById(gameId).populate('players.user', 'username displayName');
        if (game) {
          const playerInGame = game.players.find(p => (p.user._id || p.user).toString() === socket.userId.toString());
          if (playerInGame && !playerInGame.disconnected) {
            playerInGame.scoreBeforeDisconnect = playerInGame.score;
            playerInGame.disconnected = true;
            await game.save();
            console.log(`[LEAVE ROOM] Marked player ${socket.userId} as disconnected in game ${gameId}, saved score: ${playerInGame.scoreBeforeDisconnect}`);
          }

          // Always notify the game room so final-results UI can update header/counters in real time
          io.to(`game-${gameId}`).emit('player-disconnected', {
            odisconnectedPlayerId: socket.userId.toString(),
            odisconnectedPlayerName: displayName,
            players: game.players.map(p => ({
              odisconnectedPlayerId: (p.user._id || p.user).toString(),
              odisconnectedPlayerName: p.user.displayName || p.user.username || 'Player',
              disconnected: p.disconnected,
              score: p.disconnected ? 0 : p.score
            }))
          });

          // If letter selector leaves during selection, advance selector
          if (game.status === 'selecting_letter') {
            const currentSelectorId = (game.letterSelector || '').toString();
            if (currentSelectorId === socket.userId.toString()) {
              console.log(`[LEAVE ROOM] Letter selector left, passing turn to next player`);
              await handleLetterSelectorDisconnect(game, gameId);
            }
          }

          // If we are on the end screen, keep rematch counters accurate
          if (game.status === 'finished' || game.status === 'round_ended') {
            const connectedPlayers = game.players.filter(p => !p.disconnected);
            const roomId = game.room.toString();
            const set = rematchReady.get(roomId);
            if (set) set.delete(socket.userId.toString());

            const runningCountdown = rematchCountdownTimers.get(roomId);
            if (runningCountdown) {
              clearInterval(runningCountdown);
              rematchCountdownTimers.delete(roomId);
              rematchReady.delete(roomId);
              io.to(`game-${gameId}`).emit('rematch-aborted', { reason: 'player-left' });
            }

            io.to(`game-${gameId}`).emit('rematch-update', {
              ready: rematchReady.get(roomId) ? rematchReady.get(roomId).size : 0,
              total: connectedPlayers.length
            });

            if (connectedPlayers.length < 2) {
              rematchReady.delete(roomId);
              const t = rematchCountdownTimers.get(roomId);
              if (t) {
                clearInterval(t);
                rematchCountdownTimers.delete(roomId);
              }
              io.to(`game-${gameId}`).emit('rematch-aborted', { reason: 'not-enough-players' });
            }
          }
        }

        try {
          if (game && game.status !== 'finished') {
            const players = Array.isArray(game.players) ? game.players : [];
            const allDisconnectedNow = players.length > 0 && players.every(p => p.disconnected);
            if (allDisconnectedNow) {
              scheduleAbandonedGameCleanup(gameId, roomIdToCleanup);
            } else {
              cancelAbandonedGameCleanup(gameId);
            }
          }
        } catch (e) {
          console.error('[LEAVE ROOM] Error checking abandoned-game cleanup:', e);
        }

        // If the room is still in progress, keep the existing behavior: don't remove from Room model.
        if (isGameInProgress) {
          socket.leave(roomIdToCleanup);
          socket.leave(`game-${roomBefore.currentGame.toString()}`);
          socket.roomId = null;
          socket.gameId = null;
          return;
        }
      }

      // Game NOT in progress - normal room leave behavior
      // Remove player using atomic $pull
      let room = await Room.findOneAndUpdate(
        { _id: socket.roomId },
        { $pull: { players: { user: socket.userId } } },
        { new: true }
      ).populate('players.user', 'username displayName winPoints');

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
          room = await Room.findById(room._id).populate('players.user', 'username displayName winPoints');

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
        language: room.language || 'en',
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
      room.expiresAt = new Date(Date.now() + TTL_15_MIN_MS);
      await room.save();

      // Notify clients
      io.to(roomId).emit('game-starting', {
        roomId,
        gameId: game._id,
        language: game.language, // Pass game language into game-starting event
        countdown: 0
      });

      // No-op: don't start selection timer yet; wait for all players to be ready
    } catch (error) {
      console.error('Start game socket error:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // Game events
  socket.on('join-game', async (gameId) => {
    try {
      const nextGameIdStr = gameId?.toString?.() ? gameId.toString() : String(gameId);
      if (socket.gameId && socket.gameId.toString() !== nextGameIdStr) {
        try { socket.leave(`game-${socket.gameId.toString()}`); } catch (e) {}
      }
      // If a room was previously joined (lobby), leave it when switching games
      if (socket.roomId) {
        try { socket.leave(socket.roomId.toString()); } catch (e) {}
      }
      socket.join(`game-${nextGameIdStr}`);
      socket.gameId = nextGameIdStr;
      socket.emit('game-joined', { gameId: nextGameIdStr });

      try {
        if (socket.userId) {
          const key = `${socket.userId.toString()}:${nextGameIdStr.toString()}`;
          const entry = appBackgroundTimers.get(key);
          if (entry && entry.timer) {
            clearTimeout(entry.timer);
            appBackgroundTimers.delete(key);
          }
        }
      } catch (e) {}

      cancelAbandonedGameCleanup(gameId);

      // Send current game state and handle reconnection
      try {
        const game = await Game.findById(nextGameIdStr).populate('players.user', 'username displayName');
        if (!game) return;

        const playerInGame = game.players.find(p => (p.user._id || p.user).toString() === socket.userId?.toString());
        if (!playerInGame) return;
        try {
          socket.roomId = game.room.toString();
          socket.join(socket.roomId);
        } catch (e) {}

        // Check if this is a reconnecting player
        if (playerInGame && playerInGame.disconnected) {
          console.log(`[RECONNECT] Player ${socket.userId} reconnecting to game ${nextGameIdStr}`);
          
          // Restore player connection status and score
          playerInGame.disconnected = false;
          const restoredScore = playerInGame.scoreBeforeDisconnect || 0;
          playerInGame.score = restoredScore;
          playerInGame.scoreBeforeDisconnect = 0;
          
          // Clear any answers for the current round ONLY if the round is actively being played.
          // If the round already ended (round_ended/finished), clearing here would delete the results
          // and cause reconnecting clients to get stuck with missing round breakdown.
          if (game.status === 'playing') {
            const currentRoundAnswerIndex = playerInGame.answers.findIndex(a => a.round === game.currentRound);
            if (currentRoundAnswerIndex !== -1) {
              playerInGame.answers.splice(currentRoundAnswerIndex, 1);
            }
          }
          
          await game.save();
          
          console.log(`[RECONNECT] Restored player ${socket.userId}, score: ${restoredScore}`);

          // Notify all players about reconnection
          io.to(`game-${nextGameIdStr}`).emit('player-reconnected', {
            gameId: nextGameIdStr,
            odisconnectedPlayerId: socket.userId.toString(),
            odisconnectedPlayerName: playerInGame.user.displayName || playerInGame.user.username || 'Player',
            restoredScore,
            players: game.players.map(p => ({
              odisconnectedPlayerId: (p.user._id || p.user).toString(),
              odisconnectedPlayerName: p.user.displayName || p.user.username || 'Player',
              disconnected: p.disconnected,
              score: p.score
            }))
          });

          // Update rematch totals if in finished phase
          if (game.status === 'finished' || game.status === 'round_ended') {
            const connectedPlayers = game.players.filter(p => !p.disconnected);
            const roomId = game.room.toString();
            const set = rematchReady.get(roomId);
            io.to(`game-${nextGameIdStr}`).emit('rematch-update', {
              gameId: nextGameIdStr,
              ready: set ? set.size : 0,
              total: connectedPlayers.length
            });
          }
        }

        // Build list of disconnected players for the joining/reconnecting client
        const disconnectedPlayerIds = game.players
          .filter(p => p.disconnected)
          .map(p => (p.user._id || p.user).toString());

        // Send current game state based on phase
        if (game.status === 'selecting_categories' && game.categoryDeadline) {
          socket.emit('category-selection-started', {
            gameId,
            categories: game.categories || [],
            deadline: game.categoryDeadline,
            confirmed: (game.confirmedPlayers || []).length,
            total: (game.players || []).length,
            disconnectedPlayerIds
          });
        }
        if (game.status === 'selecting_letter' && game.letterDeadline) {
          const selectorId = (game.letterSelector || '').toString();
          const selectorPlayer = (game.players || []).find(p => (p.user._id || p.user).toString() === selectorId);
          const selectorName = selectorPlayer?.user?.displayName || selectorPlayer?.user?.username || 'Player';
          socket.emit('letter-selection-started', {
            gameId,
            selectorId,
            selectorName,
            deadline: game.letterDeadline,
            currentRound: game.currentRound,
            disconnectedPlayerIds
          });
        }
        if (game.status === 'playing' && game.roundStartTime) {
          // Calculate remaining time for reconnecting player
          const roundDuration = 60000; // 60 seconds
          const elapsed = Date.now() - new Date(game.roundStartTime).getTime();
          const remainingMs = Math.max(0, roundDuration - elapsed);
          const remainingSeconds = Math.ceil(remainingMs / 1000);

          socket.emit('game-sync', {
            gameId,
            phase: 'playing',
            currentRound: game.currentRound,
            currentLetter: game.currentLetter,
            categories: game.categories || [],
            remainingTime: remainingSeconds,
            roundStartTime: game.roundStartTime,
            disconnectedPlayerIds,
            standings: game.players.map(p => ({
              user: p.user,
              score: p.disconnected ? 0 : p.score,
              disconnected: p.disconnected
            }))
          });
        }
        if (game.status === 'validating') {
          socket.emit('game-sync', {
            gameId,
            phase: 'validation',
            currentRound: game.currentRound,
            disconnectedPlayerIds
          });
        }
        if (game.status === 'round_ended' || game.status === 'finished') {
          const connectedPlayers = game.players.filter(p => !p.disconnected);
          const roomId = game.room.toString();
          const set = rematchReady.get(roomId);
          socket.emit('game-sync', {
            gameId,
            phase: game.status === 'finished' ? 'finished' : 'round-end',
            currentRound: game.currentRound,
            totalRounds: game.rounds,
            disconnectedPlayerIds,
            standings: game.players.map(p => ({
              user: p.user,
              score: p.disconnected ? 0 : p.score,
              disconnected: p.disconnected
            })),
            roundResults: (game.players || []).map(p => ({
              user: p.user,
              answers: (p.answers || []).find(a => a.round === game.currentRound)
            })),
            rematchReady: set ? set.size : 0,
            rematchTotal: connectedPlayers.length
          });
        }
      } catch (e) {
        console.error('[JOIN-GAME] Error handling game state:', e);
      }
    } catch (error) {
      console.error('Join game socket error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Players signal they are inside the Select Categories screen
  socket.on('category-phase-ready', async (gameId) => {
    try {
      if (!socket.userId) return;
      const game = await Game.findById(gameId).populate('players.user', 'username displayName');
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
        gameId,
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
      const game = await Game.findById(gameId).populate('players.user', 'username displayName');
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
          gameId,
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
      if (!game) {
        console.log(`[LETTER SELECTED] Game ${gameId} not found`);
        return;
      }
      if (game.status !== 'selecting_letter') {
        console.log(`[LETTER SELECTED] Game ${gameId} not in selecting_letter status (current: ${game.status})`);
        return;
      }
      if (game.letterSelector.toString() !== socket.userId.toString()) {
        console.log(`[LETTER SELECTED] User ${socket.userId} is not the letter selector`);
        return;
      }

      console.log(`[LETTER SELECTED] Manual selection by user ${socket.userId} for game ${gameId}, letter: ${letter}`);

      // Clear letter selection timer since user picked manually
      const lt = letterTimers.get(game._id.toString());
      if (lt) {
        clearTimeout(lt);
        letterTimers.delete(game._id.toString());
        console.log(`[LETTER SELECTED] Cleared auto-pick timer for game ${gameId}`);
      }

      // Validate and set letter
      let chosen = null;
      if (letter && /^[A-Za-z]$/.test(letter)) {
        const up = letter.toUpperCase();
        if (!game.usedLetters.includes(up)) {
          game.currentLetter = up;
          game.usedLetters.push(up);
          chosen = up;
        }
      }
      
      // Fallback to random if invalid letter provided
      if (!chosen) {
        console.log(`[LETTER SELECTED] Invalid letter "${letter}", selecting random`);
        chosen = game.selectRandomLetter();
      }
      
      game.letterDeadline = null;
      await game.save();

      console.log(`[LETTER SELECTED] Final letter: ${chosen} for game ${gameId}, proceeding to reveal`);

      // Use centralized reveal logic
      await proceedWithLetterReveal(gameId.toString(), chosen);
    } catch (error) {
      console.error('[LETTER SELECTED] Error:', error);
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
        gameId,
        playerId: socket.userId,
        username,
        timestamp: new Date()
      });
      io.to(`game-${gameId}`).emit('round-ended', { gameId, reason: 'stopped', validationDeadline: g.validationDeadline });

      try {
        const roomId = g.room ? g.room.toString() : null;
        if (roomId) {
          io.to(roomId).emit('player-stopped', {
            gameId,
            playerId: socket.userId,
            username,
            timestamp: new Date()
          });
          io.to(roomId).emit('round-ended', { gameId, reason: 'stopped', validationDeadline: g.validationDeadline });
        }
      } catch (e) {}
      const vt = validationTimers.get(idStr);
      if (vt) clearTimeout(vt);
      const allSubmitted = (g.players || []).every(p => (p.answers || []).some(a => a.round === g.currentRound));
      const waitMs = allSubmitted ? 0 : graceMs;
      console.log(`[ROUND END] reason=stopped game=${gameId} round=${g.currentRound} stopper=${username} allSubmitted=${allSubmitted} graceMs=${graceMs} waitMs=${waitMs}`);
      const timer = setTimeout(async () => {
        validationTimers.delete(idStr);
        try {
          const now = new Date();
          const staleBefore = new Date(Date.now() - VALIDATION_LOCK_STALE_MS);
          const locked = await Game.findOneAndUpdate(
            {
              _id: gameId,
              status: 'validating',
              $or: [
                { validationInProgress: { $exists: false } },
                { validationInProgress: false },
                {
                  validationInProgress: true,
                  $or: [
                    { validationStartedAt: { $exists: false } },
                    { validationStartedAt: null },
                    { validationStartedAt: { $lt: staleBefore } }
                  ]
                }
              ]
            },
            { $set: { validationInProgress: true, validationStartedAt: now } },
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
        gameId,
        results,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Round results socket error:', error);
    }
  });

  // Handle HTTP route triggering round advancement (no double round advance, just start letter selection)
  socket.on('advance-round-trigger', async (data) => {
    try {
      const { gameId } = data;
      if (!gameId) return;
      
      console.log(`[ADVANCE-ROUND-TRIGGER] Received for game ${gameId}`);
      
      const game = await Game.findById(gameId).populate('players.user', 'username displayName');
      if (!game) {
        console.log(`[ADVANCE-ROUND-TRIGGER] Game ${gameId} not found`);
        return;
      }
      
      // Game has already been advanced by HTTP route, just start letter selection
      if (game.status === 'selecting_letter') {
        console.log(`[ADVANCE-ROUND-TRIGGER] Starting letter selection for game ${gameId}, round ${game.currentRound}`);
        await startLetterSelection(game);
      } else {
        console.log(`[ADVANCE-ROUND-TRIGGER] Game ${gameId} not in selecting_letter status (current: ${game.status})`);
      }
    } catch (error) {
      console.error('[ADVANCE-ROUND-TRIGGER] Error:', error);
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
      io.to(`game-${gameId}`).emit('ready-update', { gameId, ready: set.size, total });

      // Start 7s countdown if not already
      if (!nextRoundTimers.get(id)) {
        let seconds = 7;
        io.to(`game-${gameId}`).emit('next-round-countdown', { gameId, seconds });
        const timer = setInterval(async () => {
          seconds -= 1;
          if (seconds > 0) {
            io.to(`game-${gameId}`).emit('next-round-countdown', { gameId, seconds });
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
    const gameIdStr = gameId.toString();
    
    // Prevent concurrent advancement with lock
    if (roundAdvancementLocks.get(gameIdStr)) {
      console.log(`[ROUND ADVANCEMENT] Already in progress for game ${gameIdStr}, skipping duplicate call`);
      return;
    }
    
    try {
      roundAdvancementLocks.set(gameIdStr, true);
      console.log(`[ROUND ADVANCEMENT] Starting for game ${gameIdStr}`);
      
      const game = await Game.findById(gameId).populate('players.user', 'username displayName');
      if (!game) {
        console.log(`[ROUND ADVANCEMENT] Game ${gameIdStr} not found`);
        return;
      }
      
      if (game.status !== 'round_ended') {
        console.log(`[ROUND ADVANCEMENT] Game ${gameIdStr} not in round_ended status (current: ${game.status})`);
        return;
      }
      
      const hasNext = game.nextRound();
      console.log(`[ROUND ADVANCEMENT] game.nextRound() returned: ${hasNext} for game ${gameIdStr}`);
      
      if (hasNext) {
        console.log(`[ROUND ADVANCEMENT] Advancing to round ${game.currentRound} for game ${gameIdStr}`);
        await game.save();
        
        // Use centralized letter selection
        await startLetterSelection(game);
      } else {
        // Update room status and user stats when game finishes
        console.log(`[SOCKET GAME FINISH] ===== GAME ${gameIdStr} HAS FINISHED! =====`);
        try {
          console.log(`[SOCKET GAME FINISH] Game ${gameIdStr} has finished! Updating stats...`);
          const standings = game.getStandings();
          console.log(`[SOCKET GAME FINISH] Standings:`, standings.map(s => ({ user: s.user, score: s.score })));
          const User = require('../models/User');
          
          // Determine tie and winner
          const highestScore = standings[0]?.score || 0;
          const winners = standings.filter(s => s.score === highestScore);
          const isTie = winners.length > 1;
          console.log(`[SOCKET GAME FINISH] Highest score: ${highestScore}, Winners count: ${winners.length}, Is tie: ${isTie}`);
          console.log(`[SOCKET GAME FINISH] Game winner:`, game.winner);
          
          // Build a quick lookup from userId -> score from standings
          const scoreByUserId = new Map(
            standings.map(s => [String((s.user && (s.user._id || s.user)) || ''), Number(s.score) || 0])
          );
          // Use all participants from game.players to ensure matchesPlayed increments for everyone
          const participants = Array.isArray(game.players) ? game.players : [];
          for (const p of participants) {
            const userId = (p.user && (p.user._id || p.user)) || p.user;
            if (!userId) continue;
            console.log(`[SOCKET GAME FINISH] Processing participant ${userId}...`);
            const user = await User.findById(userId);
            if (user) {
              console.log(`[SOCKET GAME FINISH] Before update - ${user.displayName}: matchesPlayed=${user.matchesPlayed}, winPoints=${user.winPoints}`);
              // All players get matchesPlayed incremented
              if (typeof user.matchesPlayed !== 'number' || !Number.isFinite(user.matchesPlayed)) {
                user.matchesPlayed = 0;
              }
              user.matchesPlayed += 1;
              // Winner gets their score added to winPoints (only if no tie)
              if (!isTie && game.winner) {
                const winnerId = game.winner._id || game.winner;
                if (String(userId) === String(winnerId)) {
                  if (typeof user.winPoints !== 'number' || !Number.isFinite(user.winPoints)) {
                    user.winPoints = 0;
                  }
                  const addScore = scoreByUserId.get(String(userId)) || 0;
                  user.winPoints += addScore;
                  console.log(`[SOCKET GAME FINISH] Winner ${user.displayName} (${userId}) earned ${addScore} points. Total winPoints: ${user.winPoints}`);
                }
              } else if (isTie) {
                console.log(`[SOCKET GAME FINISH] Draw detected - no winPoints awarded to ${user.displayName}`);
              }
              await user.save();
              console.log(`[SOCKET GAME FINISH] After save - ${user.displayName}: matchesPlayed=${user.matchesPlayed}, winPoints=${user.winPoints}`);
            } else {
              console.log(`[SOCKET GAME FINISH] ERROR: User ${userId} not found in database!`);
            }
          }
          
          const Room = require('../models/Room');
          const room = await Room.findById(game.room);
          if (room) {
            room.status = 'waiting';
            room.currentGame = null;
            room.expiresAt = new Date(Date.now() + TTL_15_MIN_MS);
            await room.save();
          }
          // Emit final standings and winner to all players in the current game
          console.log(`[SOCKET GAME FINISH] Emitting game-finished event to game-${gameId}`);
          io.to(`game-${gameId}`).emit('game-finished', {
            gameId,
            winner: (game.winner || null),
            standings
          });
          console.log(`[SOCKET GAME FINISH] game-finished event emitted successfully`);
        } catch (e) {
          console.error('Finalize game finish error:', e);
          io.to(`game-${gameId}`).emit('game-finished', {
            gameId,
            winner: (game.winner || null)
          });
        }
      }
    } catch (err) {
      console.error('[ROUND ADVANCEMENT] Error:', err);
    } finally {
      // Always release lock
      roundAdvancementLocks.delete(gameIdStr);
      console.log(`[ROUND ADVANCEMENT] Lock released for game ${gameIdStr}`);
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
        message: 'Room is Disolved'
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
  socket.on('send-message', async (data) => {
    try {
      const { roomId, message } = data;
      if (!socket.userId || !roomId || !message) return;

      const user = await User.findById(socket.userId).select('username displayName');
      const displayName = user?.displayName || user?.username || 'Player';

      // Emit to all users including sender, with username
      io.to(roomId).emit('new-message', {
        userId: socket.userId,
        username: user?.username || 'Player',
        displayName,
        message,
        roomId
      });
    } catch (error) {
      console.error('Chat message socket error:', error);
    }
  });

  // Disconnect (atomic updates)
  socket.on('disconnect', async () => {
    try {
      let hasAnotherActiveSocket = false;
      try {
        if (socket.userId) {
          const key = socket.userId.toString();
          const set = activeUserSockets.get(key);
          if (set) {
            set.delete(socket.id);
            if (set.size === 0) activeUserSockets.delete(key);
            else activeUserSockets.set(key, set);
          }
          const remaining = activeUserSockets.get(key);
          hasAnotherActiveSocket = !!(remaining && remaining.size > 0);
        }
      } catch (e) {}

      if (!hasAnotherActiveSocket && socket.userId) {
        emitOnlineCount();
      }

      // Clear any pending app-background timers associated with this socket
      try {
        for (const [key, entry] of appBackgroundTimers.entries()) {
          if (entry?.socketId === socket.id) {
            if (entry.timer) clearTimeout(entry.timer);
            appBackgroundTimers.delete(key);
          }
        }
      } catch (e) {}

      try {
        for (const [key, entry] of roomBackgroundTimers.entries()) {
          if (entry?.socketId === socket.id) {
            if (entry.timer) clearTimeout(entry.timer);
            roomBackgroundTimers.delete(key);
          }
        }
      } catch (e) {}

      // Clean up quick play queue
      try {
        const lang = socket.quickPlayLanguage;
        const set = lang ? quickPlayQueueByLanguage.get(lang) : null;
        if (set && set.has(socket.id)) {
          set.delete(socket.id);
          if (set.size === 0) quickPlayQueueByLanguage.delete(lang);
          socket.quickPlayUserId = null;
          socket.quickPlayLanguage = null;
          console.log(`[DISCONNECT] User removed from quick play queue (${lang}). Queue size: ${set.size}`);
        }
      } catch (e) {}

      if (hasAnotherActiveSocket) {
        console.log(`[DISCONNECT] Skipping disconnect handling for stale socket ${socket.id} (user ${socket.userId} still has another active socket)`);
        return;
      }

      if (!(socket.roomId && socket.userId)) return;

      const roomIdToCleanup = socket.roomId;
      const gameIdToCheck = socket.gameId;
      const User = require('../models/User');
      const user = await User.findById(socket.userId);
      const username = user?.username || 'Player';
      const displayName = user?.displayName || username;

      console.log(`[DISCONNECT] User ${socket.userId} (${username}) disconnected from room ${roomIdToCleanup}`);

      const roomBefore = await Room.findById(socket.roomId).select('owner players currentGame status')
        .populate('players.user', 'username displayName winPoints');
      if (!roomBefore) {
        console.log(`[DISCONNECT] Room ${socket.roomId} not found`);
        return;
      }

      const wasOwner = roomBefore.owner.toString() === socket.userId.toString();
      const isGameInProgress = roomBefore.status === 'in_progress' && roomBefore.currentGame;
      const gameIdFromSocket = socket.gameId;

      // Mark player as disconnected in game (covers both in-progress and post-game final screen)
      if (isGameInProgress || gameIdFromSocket) {
        const gameId = isGameInProgress ? roomBefore.currentGame.toString() : gameIdFromSocket.toString();
        console.log(`[DISCONNECT] Handling disconnect for game context (${gameId})`);

        const game = await Game.findById(gameId).populate('players.user', 'username displayName');
        if (game) {
          const playerInGame = game.players.find(p => (p.user._id || p.user).toString() === socket.userId.toString());
          if (playerInGame && !playerInGame.disconnected) {
            playerInGame.scoreBeforeDisconnect = playerInGame.score;
            playerInGame.disconnected = true;
            await game.save();
            console.log(`[DISCONNECT] Marked player ${socket.userId} as disconnected in game ${gameId}, saved score: ${playerInGame.scoreBeforeDisconnect}`);
          }

          // Always notify the game room so final-results UI can update header/counters in real time
          io.to(`game-${gameId}`).emit('player-disconnected', {
            odisconnectedPlayerId: socket.userId.toString(),
            odisconnectedPlayerName: displayName,
            players: game.players.map(p => ({
              odisconnectedPlayerId: (p.user._id || p.user).toString(),
              odisconnectedPlayerName: p.user.displayName || p.user.username || 'Player',
              disconnected: p.disconnected,
              score: p.disconnected ? 0 : p.score
            }))
          });

          // Check if disconnected player was the letter selector during letter selection phase
          if (game.status === 'selecting_letter') {
            const currentSelectorId = (game.letterSelector || '').toString();
            if (currentSelectorId === socket.userId.toString()) {
              console.log(`[DISCONNECT] Letter selector disconnected, passing turn to next player`);
              await handleLetterSelectorDisconnect(game, gameId);
            }
          }

          // Update rematch totals if in finished/round-end phase (dynamic count)
          if (game.status === 'finished' || game.status === 'round_ended') {
            const connectedPlayers = game.players.filter(p => !p.disconnected);
            const roomId = game.room.toString();
            const set = rematchReady.get(roomId);
            if (set) set.delete(socket.userId.toString());

            const runningCountdown = rematchCountdownTimers.get(roomId);
            if (runningCountdown) {
              clearInterval(runningCountdown);
              rematchCountdownTimers.delete(roomId);
              rematchReady.delete(roomId);
              io.to(`game-${gameId}`).emit('rematch-aborted', { reason: 'player-left' });
            }

            io.to(`game-${gameId}`).emit('rematch-update', {
              ready: rematchReady.get(roomId) ? rematchReady.get(roomId).size : 0,
              total: connectedPlayers.length
            });

            if (connectedPlayers.length < 2) {
              rematchReady.delete(roomId);
              const t = rematchCountdownTimers.get(roomId);
              if (t) {
                clearInterval(t);
                rematchCountdownTimers.delete(roomId);
              }
              io.to(`game-${gameId}`).emit('rematch-aborted', { reason: 'not-enough-players' });
            }
          }
        }

        try {
          if (game && game.status !== 'finished') {
            const players = Array.isArray(game.players) ? game.players : [];
            const allDisconnectedNow = players.length > 0 && players.every(p => p.disconnected);
            if (allDisconnectedNow) {
              scheduleAbandonedGameCleanup(gameId, roomIdToCleanup);
            } else {
              cancelAbandonedGameCleanup(gameId);
            }
          }
        } catch (e) {
          console.error('[DISCONNECT] Error checking abandoned-game cleanup:', e);
        }

        return; // Don't remove from room when game is in progress
      }

      // Game NOT in progress - normal room leave behavior
      let room = await Room.findOneAndUpdate(
        { _id: socket.roomId },
        { $pull: { players: { user: socket.userId } } },
        { new: true }
      ).populate('players.user', 'username displayName winPoints');

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
        room = await Room.findById(room._id).populate('players.user', 'username displayName winPoints');

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

      // Use connected players count (not disconnected) for rematch total
      const connectedPlayers = (game.players || []).filter(p => !p.disconnected);
      const total = connectedPlayers.length;
      
      // Inform current game room about rematch readiness
      io.to(`game-${gameId}`).emit('rematch-update', { gameId, ready: set.size, total });

      // Need at least 2 connected players for rematch
      if (total < 2) {
        console.log(`[REMATCH] Not enough connected players (${total}), aborting`);
        rematchReady.delete(roomId);
        io.to(`game-${gameId}`).emit('rematch-aborted', { gameId, reason: 'not-enough-players' });
        return;
      }

      if (set.size >= total) {
        // Start a 5-second countdown if not already running
        if (!rematchCountdownTimers.get(roomId)) {
          let seconds = 5;
          io.to(`game-${gameId}`).emit('rematch-countdown', { gameId, seconds });
          const timer = setInterval(async () => {
            seconds -= 1;
            if (seconds > 0) {
              io.to(`game-${gameId}`).emit('rematch-countdown', { gameId, seconds });
              return;
            }
            // Countdown finished
            clearInterval(timer);
            rematchCountdownTimers.delete(roomId);
            rematchReady.delete(roomId);

            // Recreate game using existing room and original player order
            try {
              const RoomModel = require('../models/Room');
              const room = await RoomModel.findById(roomId).populate('players.user');
              if (!room) return;
  
              // Load previous game to copy categories
              const prevGame = await Game.findById(gameId).select('categories');
              const startingSelector = (room.players[0].user._id || room.players[0].user);

              const newGame = new Game({
                room: room._id,
                language: room.language || 'en',
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
              room.expiresAt = new Date(Date.now() + TTL_15_MIN_MS);
              await room.save();

              const oldGameIdStr = gameId.toString();
              const deleteDelayMs = 15000;
              setTimeout(async () => {
                try {
                  const latestRoom = await RoomModel.findById(roomId).select('currentGame');
                  const currentGameIdStr = latestRoom?.currentGame ? latestRoom.currentGame.toString() : null;
                  if (currentGameIdStr && currentGameIdStr === oldGameIdStr) return;
                  try { cancelAbandonedGameCleanup(oldGameIdStr); } catch (e) {}
                  try { clearGameTimers(oldGameIdStr); } catch (e) {}
                  await Game.deleteOne({ _id: oldGameIdStr });
                } catch (e) {
                  console.error('[REMATCH] Failed to delete old game after rematch:', e);
                }
              }, deleteDelayMs);
  
              // Notify both the room and the old game room to transition to gameplay
              const payload = { roomId, gameId: newGame._id, language: newGame.language, countdown: 0 };
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
                const selectorName = selectorPlayer?.user?.displayName || selectorPlayer?.user?.username || 'Player';
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
                        gameId: g._id,
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
                          gameId: gg._id,
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
                              io.to(`game-${g3._id}`).emit('round-ended', { gameId: g3._id, reason: 'timeout', validationDeadline: g3.validationDeadline });
                              try {
                                const roomId = g3.room ? g3.room.toString() : null;
                                if (roomId) {
                                  io.to(roomId).emit('round-ended', { gameId: g3._id, reason: 'timeout', validationDeadline: g3.validationDeadline });
                                }
                              } catch (e) {}
                              const vt = validationTimers.get(g3._id.toString());
                              if (vt) clearTimeout(vt);
                              const allSubmitted = (g3.players || []).every(p => (p.answers || []).some(a => a.round === g3.currentRound));
                              const waitMs = allSubmitted ? 0 : graceMs;
                              console.log(`[ROUND END] reason=timeout game=${g3._id} round=${g3.currentRound} allSubmitted=${allSubmitted} graceMs=${graceMs} waitMs=${waitMs}`);
                              const timer = setTimeout(async () => {
                                validationTimers.delete(g3._id.toString());
                                try {
                                  const now = new Date();
                                  const staleBefore = new Date(Date.now() - VALIDATION_LOCK_STALE_MS);
                                  const locked = await Game.findOneAndUpdate(
                                    {
                                      _id: g3._id,
                                      status: 'validating',
                                      $or: [
                                        { validationInProgress: { $exists: false } },
                                        { validationInProgress: false },
                                        {
                                          validationInProgress: true,
                                          $or: [
                                            { validationStartedAt: { $exists: false } },
                                            { validationStartedAt: null },
                                            { validationStartedAt: { $lt: staleBefore } }
                                          ]
                                        }
                                      ]
                                    },
                                    { $set: { validationInProgress: true, validationStartedAt: now } },
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
  socket.on('quickplay-join', async (payload) => {
    try {
      if (!socket.userId) {
        socket.emit('quickplay-error', { message: 'Not authenticated' });
        return;
      }

      const requestedLanguage = (payload && payload.language) || 'en';
      if (!['en', 'es'].includes(requestedLanguage)) {
        socket.emit('quickplay-error', { message: 'Invalid language' });
        return;
      }

      // If the user was already queued for a different language, remove them first
      try {
        const prevLang = socket.quickPlayLanguage;
        const prevSet = prevLang ? quickPlayQueueByLanguage.get(prevLang) : null;
        if (prevSet && prevSet.has(socket.id)) {
          prevSet.delete(socket.id);
          if (prevSet.size === 0) quickPlayQueueByLanguage.delete(prevLang);
        }
      } catch (e) {}

      console.log(`[QUICKPLAY] User ${socket.userId} joining queue (language=${requestedLanguage})`);

      // First, check if there are any available public rooms
      const Room = require('../models/Room');
      const availableRooms = await Room.find({
        isPublic: true,
        status: 'waiting',
        language: requestedLanguage,
        $expr: { $lt: [{ $size: '$players' }, '$maxPlayers'] }
      }).populate('players.user owner', 'username displayName').limit(1);

      if (availableRooms.length > 0) {
        // Join the first available public room
        const room = availableRooms[0];
        console.log(`[QUICKPLAY] Found existing room ${room._id} for user ${socket.userId}`);
        
        // Check if user is already in the room
        const alreadyInRoom = room.players.some(p => (p.user._id || p.user).toString() === socket.userId.toString());
        const refreshedExpiresAt = new Date(Date.now() + TTL_15_MIN_MS);
        let needsSave = false;
        if (!alreadyInRoom) {
          room.players.push({ user: socket.userId, isReady: false });
          needsSave = true;
        }
        if (!room.expiresAt || (room.expiresAt instanceof Date && room.expiresAt.getTime() < refreshedExpiresAt.getTime())) {
          room.expiresAt = refreshedExpiresAt;
          needsSave = true;
        }
        if (needsSave) {
          await room.save();
        }

        socket.emit('quickplay-matched', { roomId: room._id.toString() });
        return;
      }

      // No available rooms, add to queue
      const set = quickPlayQueueByLanguage.get(requestedLanguage) || new Set();
      set.add(socket.id);
      quickPlayQueueByLanguage.set(requestedLanguage, set);
      socket.quickPlayUserId = socket.userId;
      socket.quickPlayLanguage = requestedLanguage;
      console.log(`[QUICKPLAY] Added to queue (${requestedLanguage}). Queue size: ${set.size}`);

      // Check if we have enough players to create a room
      const minPlayers = parseInt(process.env.QUICKPLAY_MIN_PLAYERS || '2');
      if (set.size >= minPlayers) {
        console.log(`[QUICKPLAY] Enough players (${set.size}/${minPlayers}) in ${requestedLanguage}, creating room...`);

        // Get the first N players from the queue
        const selectedSockets = Array.from(set).slice(0, minPlayers);
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
            language: requestedLanguage,
            maxPlayers: 8,
            rounds: 3,
            hasPassword: false,
            expiresAt: new Date(Date.now() + TTL_15_MIN_MS),
            players: sockets.map(s => ({ user: s.quickPlayUserId, isReady: s.quickPlayUserId.toString() === owner.toString() }))
          });
          // Generate invite code so players can share the room
          newRoom.generateInviteCode();
          await newRoom.save();
          const roomId = newRoom._id.toString();

          console.log(`[QUICKPLAY] Created room ${roomId} with ${sockets.length} players`);

          // Remove matched players from queue
          for (const s of sockets) {
            set.delete(s.id);
            s.quickPlayUserId = null;
            s.quickPlayLanguage = null;
          }
          if (set.size === 0) quickPlayQueueByLanguage.delete(requestedLanguage);

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
    try {
      const lang = socket.quickPlayLanguage;
      const set = lang ? quickPlayQueueByLanguage.get(lang) : null;
      if (set && set.has(socket.id)) {
        set.delete(socket.id);
        if (set.size === 0) quickPlayQueueByLanguage.delete(lang);
        socket.quickPlayUserId = null;
        socket.quickPlayLanguage = null;
        console.log(`[QUICKPLAY] User left queue (${lang}). Queue size: ${set.size}`);
      }
    } catch (e) {}
  });
};
