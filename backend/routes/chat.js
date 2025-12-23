const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const ChatMessage = require('../models/ChatMessage');

router.get('/global', authMiddleware, async (req, res) => {
  try {
    const language = (req.query.language === 'es' || req.query.language === 'en') ? req.query.language : 'en';
    const limitRaw = parseInt(req.query.limit || '50');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 50;

    const beforeRaw = req.query.before;
    const beforeDate = beforeRaw ? new Date(beforeRaw) : null;

    const channel = `global:${language}`;

    const query = { channel };
    if (beforeDate && !Number.isNaN(beforeDate.getTime())) {
      query.createdAt = { $lt: beforeDate };
    }

    const docs = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .select('_id channel language user usernameSnapshot displayNameSnapshot message createdAt');

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    const messages = page
      .slice()
      .reverse()
      .map((d) => ({
        id: String(d._id),
        channel: d.channel,
        language: d.language,
        userId: String(d.user),
        username: d.usernameSnapshot,
        displayName: d.displayNameSnapshot,
        message: d.message,
        createdAt: d.createdAt
      }));

    const nextBefore = messages.length > 0 ? messages[0].createdAt : null;

    res.json({
      language,
      messages,
      hasMore,
      nextBefore
    });
  } catch (error) {
    console.error('Chat global history error:', error);
    res.status(500).json({ message: 'Error fetching chat history' });
  }
});

module.exports = router;
