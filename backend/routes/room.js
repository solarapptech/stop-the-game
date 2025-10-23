const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Room = require('../models/Room');
const { authMiddleware } = require('../middleware/auth');
const bcrypt = require('bcrypt');

// Create room
router.post('/create', authMiddleware, [
  body('name').trim().isLength({ min: 1, max: 50 }),
  body('rounds').isIn([1, 3, 6, 9]),
  body('isPublic').isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, password, isPublic, rounds } = req.body;

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const room = new Room({
      name,
      owner: req.user._id,
      password: hashedPassword,
      isPublic,
      rounds,
      players: [{
        user: req.user._id,
        isReady: true  // Owner is always ready
      }]
    });

    // Generate invite code
    room.generateInviteCode();
    await room.save();

    await room.populate('players.user', 'username winPoints');

    res.status(201).json({
      message: 'Room created successfully',
      room: {
        id: room._id,
        name: room.name,
        owner: room.owner,
        isPublic: room.isPublic,
        rounds: room.rounds,
        inviteCode: room.inviteCode,
        players: room.players,
        status: room.status,
        hasPassword: !!room.password
      }
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ message: 'Error creating room' });
  }
});

// Get public rooms
router.get('/public', async (req, res) => {
  try {
    const rooms = await Room.find({
      isPublic: true,
      status: 'waiting'
    })
    .populate('owner', 'username')
    .populate('players.user', 'username')
    .select('-password')
    .sort('-createdAt')
    .limit(20);

    res.json({
      rooms: rooms.map(room => ({
        id: room._id,
        name: room.name,
        owner: room.owner,
        rounds: room.rounds,
        players: room.players,
        maxPlayers: room.maxPlayers,
        hasPassword: !!room.password,
        status: room.status
      }))
    });
  } catch (error) {
    console.error('Get public rooms error:', error);
    res.status(500).json({ message: 'Error fetching rooms' });
  }
});

// Join room by ID
router.post('/join/:roomId', authMiddleware, [
  body('password').optional()
], async (req, res) => {
  try {
    const { roomId } = req.params;
    const { password } = req.body;

    const room = await Room.findById(roomId)
      .populate('players.user', 'username winPoints');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.status !== 'waiting') {
      return res.status(400).json({ message: 'Game already in progress' });
    }

    // Check password if room has one
    if (room.password) {
      if (!password) {
        return res.status(401).json({ message: 'Password required' });
      }
      const isValid = await bcrypt.compare(password, room.password);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid password' });
      }
    }

    // Check if user already in room
    if (room.hasPlayer(req.user._id)) {
      return res.status(400).json({ message: 'Already in room' });
    }

    // Add player to room
    try {
      room.addPlayer(req.user._id);
      await room.save();
      await room.populate('players.user', 'username winPoints');

      res.json({
        message: 'Joined room successfully',
        room: {
          id: room._id,
          name: room.name,
          owner: room.owner,
          rounds: room.rounds,
          players: room.players,
          status: room.status
        }
      });
    } catch (error) {
      if (error.message === 'Room is full') {
        return res.status(400).json({ message: 'Room is full' });
      }
      throw error;
    }
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ message: 'Error joining room' });
  }
});

// Join room by invite code
router.post('/join-by-code', authMiddleware, [
  body('inviteCode').trim().isLength({ min: 6, max: 6 }),
  body('password').optional()
], async (req, res) => {
  try {
    const { inviteCode, password } = req.body;

    const room = await Room.findOne({ inviteCode })
      .populate('players.user', 'username winPoints');

    if (!room) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    if (room.status !== 'waiting') {
      return res.status(400).json({ message: 'Game already in progress' });
    }

    // Check password if room has one
    if (room.password) {
      if (!password) {
        return res.status(401).json({ 
          message: 'Password required',
          needsPassword: true,
          roomName: room.name
        });
      }
      const isValid = await bcrypt.compare(password, room.password);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid password' });
      }
    }

    // Check if user already in room
    if (room.hasPlayer(req.user._id)) {
      return res.json({
        message: 'Already in room',
        room: {
          id: room._id,
          name: room.name,
          owner: room.owner,
          rounds: room.rounds,
          players: room.players,
          status: room.status
        }
      });
    }

    // Add player to room
    try {
      room.addPlayer(req.user._id);
      await room.save();
      await room.populate('players.user', 'username winPoints');

      res.json({
        message: 'Joined room successfully',
        room: {
          id: room._id,
          name: room.name,
          owner: room.owner,
          rounds: room.rounds,
          players: room.players,
          status: room.status
        }
      });
    } catch (error) {
      if (error.message === 'Room is full') {
        return res.status(400).json({ message: 'Room is full' });
      }
      throw error;
    }
  } catch (error) {
    console.error('Join by code error:', error);
    res.status(500).json({ message: 'Error joining room' });
  }
});

// Leave room
router.post('/leave/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    // Load minimal fields to check ownership before removal
    const before = await Room.findById(roomId).select('owner players');
    if (!before) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const wasOwner = before.owner.toString() === req.user._id.toString();

    // Atomic removal
    let updated = await Room.findOneAndUpdate(
      { _id: roomId },
      { $pull: { players: { user: req.user._id } } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (updated.players.length === 0) {
      await Room.deleteOne({ _id: updated._id });
      return res.json({ message: 'Room deleted' });
    }

    if (wasOwner) {
      // Transfer ownership to next player and set ready
      const next = updated.players[0];
      const newOwnerId = (next.user._id || next.user).toString();
      await Room.updateOne(
        { _id: updated._id },
        { $set: { owner: newOwnerId, 'players.$[elem].isReady': true } },
        { arrayFilters: [ { 'elem.user': next.user._id || next.user } ] }
      );
    }

    res.json({ message: 'Left room successfully' });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ message: 'Error leaving room' });
  }
});

// Get room details
router.get('/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId)
      .populate('owner', 'username')
      .populate('players.user', 'username winPoints matchesPlayed')
      .select('-password');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({
      room: {
        id: room._id,
        name: room.name,
        owner: room.owner,
        isPublic: room.isPublic,
        rounds: room.rounds,
        inviteCode: room.inviteCode,
        players: room.players,
        maxPlayers: room.maxPlayers,
        status: room.status,
        hasPassword: !!room.password,
        canStart: room.canStart(),
        isOwner: room.owner._id.toString() === req.user._id.toString()
      }
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ message: 'Error fetching room' });
  }
});

// Set ready status
router.post('/:roomId/ready', authMiddleware, [
  body('isReady').isBoolean()
], async (req, res) => {
  try {
    const { roomId } = req.params;
    const { isReady } = req.body;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!room.hasPlayer(req.user._id)) {
      return res.status(403).json({ message: 'Not in this room' });
    }

    room.setPlayerReady(req.user._id, isReady);
    await room.save();

    res.json({ 
      message: 'Ready status updated',
      allReady: room.allPlayersReady()
    });
  } catch (error) {
    console.error('Set ready error:', error);
    res.status(500).json({ message: 'Error updating ready status' });
  }
});

module.exports = router;
