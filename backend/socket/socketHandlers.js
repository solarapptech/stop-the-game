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

      // Notify others in room
      socket.to(roomId).emit('player-joined', {
        roomId,
        players: room.players
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
