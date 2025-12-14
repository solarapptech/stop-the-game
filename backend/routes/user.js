const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');

// Get user profile
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -verificationCode -verificationCodeExpires');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate a weak ETag based on fields relevant to dashboard stats & profile display
    try {
      const basis = [
        String(user._id),
        String(user.updatedAt?.getTime?.() || ''),
        String(user.winPoints || 0),
        String(user.matchesPlayed || 0),
        String(user.subscribed || false),
        String(user.displayName || ''),
      ].join(':');
      const crypto = require('crypto');
      const etag = 'W/"' + crypto.createHash('sha1').update(basis).digest('hex') + '"';
      const inm = req.headers['if-none-match'];
      if (inm && inm === etag) {
        return res.status(304).end();
      }
      res.set('ETag', etag);
    } catch (e) {
      // ignore ETag errors
    }

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.getDecryptedEmail(),
        verified: user.verified,
        language: user.language,
        winPoints: user.winPoints,
        matchesPlayed: user.matchesPlayed,
        subscribed: user.subscribed
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Update settings
router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const { soundEnabled, musicEnabled, notifications } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (soundEnabled !== undefined) user.settings.soundEnabled = soundEnabled;
    if (musicEnabled !== undefined) user.settings.musicEnabled = musicEnabled;
    if (notifications !== undefined) user.settings.notifications = notifications;

    await user.save();

    res.json({
      message: 'Settings updated',
      settings: user.settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Error updating settings' });
  }
});

// Update language preference
router.put('/language', authMiddleware, async (req, res) => {
  try {
    const { language } = req.body;

    if (!language || !['en', 'es'].includes(language)) {
      return res.status(400).json({ message: 'Invalid language. Must be "en" or "es"' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.language = language;
    await user.save();

    res.json({
      message: 'Language updated',
      language: user.language
    });
  } catch (error) {
    console.error('Update language error:', error);
    res.status(500).json({ message: 'Error updating language' });
  }
});

// Add friend
router.post('/friends/add', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.body;

    if (friendId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot add yourself as friend' });
    }

    const friend = await User.findById(friendId);
    if (!friend) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await User.findById(req.user._id);
    if (user.friends.includes(friendId)) {
      return res.status(400).json({ message: 'Already friends' });
    }

    user.friends.push(friendId);
    await user.save();

    res.json({
      message: 'Friend added',
      friends: user.friends
    });
  } catch (error) {
    console.error('Add friend error:', error);
    res.status(500).json({ message: 'Error adding friend' });
  }
});

// Get friends list
router.get('/friends', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends', 'username displayName winPoints matchesPlayed');

    res.json({
      friends: user.friends
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ message: 'Error fetching friends' });
  }
});

// Search users
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ users: [] });
    }

    const users = await User.find({
      username: { $regex: query, $options: 'i' }
    })
    .select('username displayName winPoints matchesPlayed')
    .limit(10);

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Error searching users' });
  }
});

module.exports = router;
