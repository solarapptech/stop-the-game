const mongoose = require('mongoose');

const CHAT_TTL_SECONDS = 7 * 24 * 60 * 60;

const chatMessageSchema = new mongoose.Schema({
  channel: {
    type: String,
    required: true,
    index: true
  },
  language: {
    type: String,
    enum: ['en', 'es'],
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  usernameSnapshot: {
    type: String,
    default: ''
  },
  displayNameSnapshot: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: CHAT_TTL_SECONDS,
    index: true
  }
});

chatMessageSchema.index({ channel: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
