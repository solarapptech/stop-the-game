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

  // Leave room
  socket.on('leave-room', async () => {
    try {
      if (socket.roomId && socket.userId) {
        const User = require('../models/User');
        const user = await User.findById(socket.userId);
        const username = user?.username || 'Player';

        const room = await Room.findById(socket.roomId)
          .populate('players.user', 'username winPoints');

        if (room) {
          const wasOwner = room.owner.toString() === socket.userId.toString();
          
          // Remove player from room in DB
          const removed = room.removePlayer(socket.userId);
          
          if (removed) {
            // If owner leaves and room still has players, transfer ownership
            if (wasOwner && room.players.length > 0) {
              const newOwner = room.players[0].user;
              room.owner = newOwner._id || newOwner;
              
              // Set new owner as ready
              room.setPlayerReady(room.owner, true);
              
              await room.save();
              
              // Notify all players about ownership transfer and updated player list
              io.to(socket.roomId).emit('ownership-transferred', {
                newOwnerId: room.owner.toString(),
                players: room.players,
                username: newOwner.username || 'Player'
              });
            } else if (room.players.length === 0) {
              // Delete room if empty
              await room.deleteOne();
            } else {
              await room.save();
            }

            // Notify others with updated list
            socket.to(socket.roomId).emit('player-left', {
              roomId: socket.roomId,
              players: room.players,
              username,
              newOwnerId: wasOwner && room.players.length > 0 ? room.owner.toString() : null
            });
          }
        }

        // Leave socket room after notifying
        socket.leave(socket.roomId);
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

  // Disconnect
  socket.on('disconnect', async () => {
    try {
      if (socket.roomId && socket.userId) {
        const User = require('../models/User');
        const user = await User.findById(socket.userId);
        const username = user?.username || 'Player';
        
        const room = await Room.findById(socket.roomId)
          .populate('players.user', 'username winPoints');
          
        if (room) {
          const wasOwner = room.owner.toString() === socket.userId.toString();
          
          room.removePlayer(socket.userId);
          
          // If owner disconnects and room still has players, transfer ownership
          if (wasOwner && room.players.length > 0) {
            const newOwner = room.players[0].user;
            room.owner = newOwner._id || newOwner;
            
            // Set new owner as ready
            room.setPlayerReady(room.owner, true);
            
            await room.save();
            
            // Notify all players about ownership transfer and updated player list
            io.to(socket.roomId).emit('ownership-transferred', {
              newOwnerId: room.owner.toString(),
              players: room.players,
              username: newOwner.username || 'Player'
            });
          } else if (room.players.length === 0) {
            // Delete room if empty
            await room.deleteOne();
          } else {
            await room.save();
          }
          
          socket.to(socket.roomId).emit('player-left', {
            roomId: socket.roomId,
            players: room.players,
            username,
            newOwnerId: wasOwner && room.players.length > 0 ? room.owner.toString() : null
          });
        }
      }
    } catch (error) {
      console.error('Disconnect socket error:', error);
    }
  });
};
