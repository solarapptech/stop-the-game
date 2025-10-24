const Room = require('../models/Room');
const Game = require('../models/Game');
const jwt = require('jsonwebtoken');
const categoryTimers = new Map();

module.exports = (io, socket) => {
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
    } catch (error) {
      console.error('Finalize categories error:', error);
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

      const User = require('../models/User');
      const user = await User.findById(socket.userId);
      const username = user?.username || 'Player';

      // Load room to determine ownership before removal
      const roomBefore = await Room.findById(socket.roomId).select('owner players')
        .populate('players.user', 'username winPoints');
      if (!roomBefore) return;

      const wasOwner = roomBefore.owner.toString() === socket.userId.toString();

      // Remove player using atomic $pull
      let room = await Room.findOneAndUpdate(
        { _id: socket.roomId },
        { $pull: { players: { user: socket.userId } } },
        { new: true }
      ).populate('players.user', 'username winPoints');

      if (!room) return;

      if (room.players.length === 0) {
        // Room empty => delete it
        await Room.deleteOne({ _id: room._id });
      } else if (wasOwner) {
        // Transfer ownership to next player and set them ready
        const next = room.players[0];
        const newOwnerId = (next.user._id || next.user).toString();
        await Room.updateOne(
          { _id: room._id },
          { 
            $set: { owner: newOwnerId, 'players.$[elem].isReady': true }
          },
          { arrayFilters: [ { 'elem.user': next.user._id || next.user } ] }
        );
        // Reload populated
        room = await Room.findById(room._id).populate('players.user', 'username winPoints');

        io.to(socket.roomId).emit('ownership-transferred', {
          newOwnerId,
          players: room.players,
          username: next.user.username || 'Player',
          inviteCode: room.inviteCode
        });
      }

      // Notify others about the player leaving with updated list
      socket.to(socket.roomId).emit('player-left', {
        roomId: socket.roomId,
        players: room.players,
        username,
        newOwnerId: wasOwner && room.players.length > 0 ? (room.players[0].user._id || room.players[0].user).toString() : null
      });

      // Leave socket room
      socket.leave(socket.roomId);
      socket.roomId = null;
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

  // Start game (create Game, start category selection phase with 12s deadline)
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
      // Start category selection countdown
      const deadline = new Date(Date.now() + 12000);
      game.categoryDeadline = deadline;
      game.status = 'selecting_categories';
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

      // Also announce category phase start (for those still in the room)
      io.to(roomId).emit('category-selection-started', {
        gameId: game._id,
        deadline,
        categories: game.categories
      });

      // Schedule finalize
      const timer = setTimeout(async () => {
        categoryTimers.delete(game._id.toString());
        await finalizeCategories(game._id.toString());
      }, 12000);
      categoryTimers.set(game._id.toString(), timer);
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
        const game = await Game.findById(gameId).select('status categories categoryDeadline letterSelector');
        if (game && game.status === 'selecting_categories') {
          socket.emit('category-selection-started', {
            gameId,
            categories: game.categories || [],
            deadline: game.categoryDeadline
          });
        }
      } catch (e) {}
    } catch (error) {
      console.error('Join game socket error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Category selected (unique across game, max 8)
  socket.on('category-selected', async (data) => {
    try {
      const { gameId, category } = data;
      const allowed = ['Name', 'Last Name', 'City/Country', 'Animal', 'Fruit/Food', 'Color', 'Object', 'Brand', 'Profession', 'Sports'];

      if (!socket.userId) return;
      if (!allowed.includes(category)) return;

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

  // Letter selected (persist and broadcast)
  socket.on('letter-selected', async (data) => {
    try {
      const { gameId, letter } = data;
      const game = await Game.findById(gameId);
      if (!game) return;
      if (game.status !== 'selecting_letter') return;
      if (game.letterSelector.toString() !== socket.userId.toString()) return;

      if (letter && /^[A-Za-z]$/.test(letter) && !game.usedLetters.includes(letter.toUpperCase())) {
        game.currentLetter = letter.toUpperCase();
        game.usedLetters.push(letter.toUpperCase());
      } else {
        game.selectRandomLetter();
      }

      game.status = 'playing';
      game.roundStartTime = new Date();
      await game.save();

      io.to(`game-${gameId}`).emit('letter-selected', {
        letter: game.currentLetter
      });
    } catch (error) {
      console.error('Letter selected socket error:', error);
    }
  });

  // Player stopped
  socket.on('player-stopped', async (data) => {
    try {
      const { gameId } = data;
      const User = require('../models/User');
      let username = 'Player';
      try {
        const u = await User.findById(socket.userId).select('username');
        if (u && u.username) username = u.username;
      } catch (e) {}
      io.to(`game-${gameId}`).emit('player-stopped', {
        playerId: socket.userId,
        username,
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
      if (!(socket.roomId && socket.userId)) return;

      const User = require('../models/User');
      const user = await User.findById(socket.userId);
      const username = user?.username || 'Player';

      const roomBefore = await Room.findById(socket.roomId).select('owner players')
        .populate('players.user', 'username winPoints');
      if (!roomBefore) return;

      const wasOwner = roomBefore.owner.toString() === socket.userId.toString();

      let room = await Room.findOneAndUpdate(
        { _id: socket.roomId },
        { $pull: { players: { user: socket.userId } } },
        { new: true }
      ).populate('players.user', 'username winPoints');

      if (!room) return;

      if (room.players.length === 0) {
        await Room.deleteOne({ _id: room._id });
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
        room = await Room.findById(room._id).populate('players.user', 'username winPoints');

        io.to(socket.roomId).emit('ownership-transferred', {
          newOwnerId,
          players: room.players,
          username: next.user.username || 'Player',
          inviteCode: room.inviteCode
        });
      }

      socket.to(socket.roomId).emit('player-left', {
        roomId: socket.roomId,
        players: room.players,
        username,
        newOwnerId: wasOwner && room.players.length > 0 ? (room.players[0].user._id || room.players[0].user).toString() : null
      });
    } catch (error) {
      console.error('Disconnect socket error:', error);
    }
  });
};
