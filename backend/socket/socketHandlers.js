const Room = require('../models/Room');
const Game = require('../models/Game');
const jwt = require('jsonwebtoken');

module.exports = (io, socket) => {
  // Authenticate socket connection
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = socket.handshake.query.userId;
      socket.emit('authenticated', { success: true });
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Invalid token' });
    }
  });

  // Join room
  socket.on('join-room', async (data) => {
    try {
      const { roomId } = data;
      const room = await Room.findOne({ roomId }).populate('players.user', 'username');
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      // Add player to room if not already in it
      const playerExists = room.players.some(p => p.user._id.toString() === socket.userId);
      if (!playerExists) {
        room.players.push({ user: socket.userId, isReady: false });
        await room.save();
      }
      
      socket.join(roomId);
      socket.currentRoom = roomId;

      // Notify all players in the room about the updated state
      const updatedRoom = await Room.findById(room._id).populate('players.user', 'username');
      io.to(roomId).emit('update-room-state', updatedRoom);

    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Leave room
  socket.on('leave-room', async () => {
    try {
      if (socket.roomId) {
        socket.leave(socket.roomId);
        
        const room = await Room.findById(socket.roomId)
          .populate('players.user', 'username winPoints');
        
        if (room) {
          socket.to(socket.roomId).emit('player-left', {
            roomId: socket.roomId,
            players: room.players
          });
        }
        
        socket.roomId = null;
      }
    } catch (error) {
      console.error('Leave room socket error:', error);
    }
  });

  // Player ready
  socket.on('player-ready', async (data) => {
    try {
      const { roomId, isReady } = data;
      
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const room = await Room.findById(roomId);
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      room.setPlayerReady(socket.userId, isReady);
      await room.save();

      // Notify all players in the room about the updated state
      const updatedRoom = await Room.findById(room._id).populate('players.user', 'username');
      io.to(room.roomId).emit('update-room-state', updatedRoom);
    } catch (error) {
      console.error('Toggle ready error:', error);
      socket.emit('error', { message: 'Failed to toggle ready status' });
    }
  });

  // Start game
  socket.on('start-game', async (roomId) => {
    try {
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const room = await Room.findById(roomId);
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      if (room.owner.toString() !== socket.userId) {
        return socket.emit('error', { message: 'Only owner can start game' });
      }

      // Create a new game
      const game = new Game({
        room: room._id,
        players: room.players.map(p => ({ user: p.user })),
        rounds: room.rounds,
        phase: 'category-selection',
      });
      await game.save();

      // Associate game with room
      room.game = game._id;
      await room.save();

      // Announce game starting and provide game ID
      io.to(roomId).emit('game-starting', {
        roomId,
        gameId: game._id,
        countdown: 3
      });

      // Make all sockets in the room join the game-specific room
      const socketsInRoom = await io.in(roomId).fetchSockets();
      for (const sock of socketsInRoom) {
        sock.join(`game-${game._id}`);
      }

      // Start category selection phase
      setTimeout(() => {
        startCategorySelection(game._id);
      }, 3000); // after countdown

    } catch (error) {
      console.error('Start game socket error:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // --- Helper function to manage category selection phase ---
  const startCategorySelection = async (gameId) => {
    try {
      const game = await Game.findById(gameId);
      if (!game || game.phase !== 'category-selection') return;

      // Announce that category selection has started
      io.to(`game-${gameId}`).emit('category-selection-started', {
        allSelectedCategories: game.allSelectedCategories,
      });

      // Set a 12-second timer for category selection
      const categoryTimer = setTimeout(async () => {
        const timedOutGame = await Game.findById(gameId);
        if (timedOutGame && timedOutGame.phase === 'category-selection') {
          // Logic to auto-fill categories if not confirmed
          // For simplicity, we'll just move to the next phase.
          // A more complete implementation would randomly select remaining categories.
          
          // Finalize categories
          const finalCategories = Array.from(new Set(timedOutGame.allSelectedCategories));
          timedOutGame.categories = finalCategories;
          timedOutGame.phase = 'letter-selection';
          
          // Designate a player to select the letter (e.g., the first player)
          timedOutGame.currentPlayer = timedOutGame.players[0];
          await timedOutGame.save();

          io.to(`game-${gameId}`).emit('categories-confirmed', {
            categories: timedOutGame.categories,
            currentPlayer: timedOutGame.currentPlayer,
          });
        }
      }, 12000); // 12 seconds

      // Store timer to clear it if all players confirm early
      game.categoryTimer = categoryTimer;
      await game.save();

    } catch (error) {
      console.error('Category selection start error:', error);
    }
  };

  // Game events
  socket.on('join-game', async (gameId) => {
    try {
      socket.join(`game-${gameId}`);
      socket.gameId = gameId;
      socket.emit('game-joined', { gameId });
    } catch (error) {
      console.error('Join game socket error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Category selected
  socket.on('select-category', async (data) => {
    try {
      const { gameId, category } = data;
      const game = await Game.findById(gameId);

      if (!game || game.phase !== 'category-selection') return;

      const playerSelection = game.playerSelections.get(socket.userId) || [];
      const allCategories = game.allSelectedCategories || [];

      if (playerSelection.includes(category)) {
        // Deselect
        const newSelection = playerSelection.filter(c => c !== category);
        game.playerSelections.set(socket.userId, newSelection);
        
        const newAllCategories = allCategories.filter(c => c !== category);
        game.allSelectedCategories = newAllCategories;

      } else {
        // Select
        if (playerSelection.length >= 8) return; // Max 8 categories
        if (allCategories.includes(category)) return; // Already taken

        game.playerSelections.set(socket.userId, [...playerSelection, category]);
        game.allSelectedCategories.push(category);
      }
      
      await game.save();

      io.to(`game-${gameId}`).emit('categories-updated', {
        allSelectedCategories: game.allSelectedCategories,
        playerSelections: Object.fromEntries(game.playerSelections),
      });

    } catch (error) {
      console.error('Select category socket error:', error);
    }
  });

  socket.on('confirm-categories', async (data) => {
    try {
      const { gameId } = data;
      const game = await Game.findById(gameId);

      if (!game || game.phase !== 'category-selection') return;

      // Mark player as confirmed
      game.confirmedPlayers.push(socket.userId);

      // Check if all players have confirmed
      const allPlayersConfirmed = game.players.every(pId => game.confirmedPlayers.includes(pId.toString()));

      if (allPlayersConfirmed) {
        // Clear the timer
        if (game.categoryTimer) {
          clearTimeout(game.categoryTimer);
          game.categoryTimer = null;
        }

        // Finalize categories and move to next phase
        const finalCategories = Array.from(new Set(game.allSelectedCategories));
        game.categories = finalCategories;
        game.phase = 'letter-selection';
        game.currentPlayer = game.players[0]; // Or choose randomly
        await game.save();

        io.to(`game-${gameId}`).emit('categories-confirmed', {
          categories: game.categories,
          currentPlayer: game.currentPlayer,
        });
      } else {
        await game.save();
        // Optionally, notify others that a player has confirmed
      }
    } catch (error) {
      console.error('Confirm categories socket error:', error);
    }
  });

  // Letter selected
  socket.on('select-letter', async (data) => {
    try {
      const { gameId } = data;
      const game = await Game.findById(gameId);

      if (!game || game.phase !== 'letter-selection') return;

      // Ensure only the current player can select a letter
      if (game.currentPlayer.toString() !== socket.userId) {
        return;
      }

      const letter = game.selectRandomLetter();
      game.phase = 'playing';
      await game.save();
      
      io.to(`game-${gameId}`).emit('letter-selected', {
        letter,
        roundStarted: true
      });
    } catch (error) {
      console.error('Letter selected socket error:', error);
    }
  });

  // Player stopped
  socket.on('player-stopped', async (data) => {
    try {
      const { gameId } = data;
      
      io.to(`game-${gameId}`).emit('round-stopped', {
        stoppedBy: socket.userId,
        timestamp: new Date()
      });
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

  // Chat message
  socket.on('chat-message', async (data) => {
    try {
      const { roomId, message } = data;
      
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      io.to(roomId).emit('new-message', {
        userId: socket.userId,
        message,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Chat message socket error:', error);
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    try {
      if (socket.roomId && socket.userId) {
        const room = await Room.findById(socket.roomId);
        if (room) {
          room.removePlayer(socket.userId);
          await room.save();
          
          socket.to(socket.roomId).emit('player-disconnected', {
            userId: socket.userId
          });
        }
      }
    } catch (error) {
      console.error('Disconnect socket error:', error);
    }
  });
};
