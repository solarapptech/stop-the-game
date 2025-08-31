const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Game = require('../models/Game');

// Get global leaderboard
router.get('/global', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const users = await User.find({ matchesPlayed: { $gt: 0 } })
      .select('username winPoints matchesPlayed')
      .sort('-winPoints')
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await User.countDocuments({ matchesPlayed: { $gt: 0 } });

    res.json({
      leaderboard: users.map((user, index) => ({
        rank: offset + index + 1,
        username: user.username,
        winPoints: user.winPoints,
        matchesPlayed: user.matchesPlayed,
        avgPoints: user.matchesPlayed > 0 ? Math.round(user.winPoints / user.matchesPlayed) : 0
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get global leaderboard error:', error);
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// Get weekly leaderboard
router.get('/weekly', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const games = await Game.find({
      createdAt: { $gte: oneWeekAgo },
      status: 'finished'
    }).populate('winner', 'username');

    // Aggregate weekly scores
    const weeklyScores = {};
    
    for (const game of games) {
      for (const player of game.players) {
        const userId = player.user.toString();
        if (!weeklyScores[userId]) {
          weeklyScores[userId] = {
            score: 0,
            gamesPlayed: 0
          };
        }
        weeklyScores[userId].score += player.score;
        weeklyScores[userId].gamesPlayed += 1;
      }
    }

    // Get user details and sort
    const leaderboard = [];
    for (const [userId, data] of Object.entries(weeklyScores)) {
      const user = await User.findById(userId).select('username');
      if (user) {
        leaderboard.push({
          username: user.username,
          weeklyPoints: data.score,
          gamesPlayed: data.gamesPlayed,
          avgPoints: Math.round(data.score / data.gamesPlayed)
        });
      }
    }

    leaderboard.sort((a, b) => b.weeklyPoints - a.weeklyPoints);

    res.json({
      leaderboard: leaderboard.slice(0, parseInt(limit)).map((user, index) => ({
        rank: index + 1,
        ...user
      })),
      period: {
        start: oneWeekAgo,
        end: new Date()
      }
    });
  } catch (error) {
    console.error('Get weekly leaderboard error:', error);
    res.status(500).json({ message: 'Error fetching weekly leaderboard' });
  }
});

// Get friends leaderboard
router.get('/friends', async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID required' });
    }

    const user = await User.findById(userId).populate('friends', 'username winPoints matchesPlayed');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Include the user in their own friends leaderboard
    const friendsList = [
      {
        _id: user._id,
        username: user.username,
        winPoints: user.winPoints,
        matchesPlayed: user.matchesPlayed
      },
      ...user.friends
    ];

    // Sort by win points
    friendsList.sort((a, b) => b.winPoints - a.winPoints);

    res.json({
      leaderboard: friendsList.map((friend, index) => ({
        rank: index + 1,
        username: friend.username,
        winPoints: friend.winPoints,
        matchesPlayed: friend.matchesPlayed,
        avgPoints: friend.matchesPlayed > 0 ? Math.round(friend.winPoints / friend.matchesPlayed) : 0,
        isYou: friend._id.toString() === userId
      }))
    });
  } catch (error) {
    console.error('Get friends leaderboard error:', error);
    res.status(500).json({ message: 'Error fetching friends leaderboard' });
  }
});

// Get user rank
router.get('/rank/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const rank = await User.countDocuments({
      winPoints: { $gt: user.winPoints }
    }) + 1;

    const totalPlayers = await User.countDocuments({ matchesPlayed: { $gt: 0 } });

    res.json({
      rank,
      totalPlayers,
      percentile: Math.round((1 - (rank / totalPlayers)) * 100),
      winPoints: user.winPoints,
      matchesPlayed: user.matchesPlayed
    });
  } catch (error) {
    console.error('Get user rank error:', error);
    res.status(500).json({ message: 'Error fetching rank' });
  }
});

module.exports = router;
