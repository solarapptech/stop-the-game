const Room = require('../models/Room');
const Game = require('../models/Game');
const jwt = require('jsonwebtoken');

module.exports = (io, socket) => {
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
          username: next.user.username || 'Player'
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

      io.to(roomId).emit('ready-status-changed', {
        userId: socket.userId,
        isReady,
        allReady: room.allPlayersReady()
      });
    } catch (error) {
      console.error('Player ready socket error:', error);
      socket.emit('error', { message: 'Failed to update ready status' });
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

      io.to(roomId).emit('game-starting', {
        roomId,
        countdown: 3
      });
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
    } catch (error) {
      console.error('Join game socket error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Category selected
  socket.on('category-selected', async (data) => {
    try {
      const { gameId, category } = data;
      
      io.to(`game-${gameId}`).emit('category-update', {
        category,
        userId: socket.userId
      });
    } catch (error) {
      console.error('Category selected socket error:', error);
    }
  });

  // Letter selected
  socket.on('letter-selected', async (data) => {
    try {
      const { gameId, letter } = data;
      
      io.to(`game-${gameId}`).emit('letter-chosen', {
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
          username: next.user.username || 'Player'
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
