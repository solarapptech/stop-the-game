const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const passport = require('passport');
const User = require('../models/User');
const { sendVerificationEmail } = require('../utils/email');
const { authMiddleware } = require('../middleware/auth');

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('username').isLength({ min: 3, max: 30 }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, username } = req.body;

    // Validate email format before encrypting
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email' });
    }

    // Normalize and compute emailHash for lookup
    const crypto = require('crypto');
    const normalizedEmail = (email || '').toLowerCase().trim();
    const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex');

    // Check if user exists by username or emailHash
    const existingUser = await User.findOne({
      $or: [
        { username },
        { emailHash }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email or username already exists' 
      });
    }

    // Create user (set emailHash for validation, displayName defaults to username)
    const user = new User({
      username,
      displayName: username,
      email,
      password,
      emailHash,
      authMethod: 'local'
    });

    // Generate verification code and save user
    const verificationCode = user.generateVerificationCode();
    await user.save();

    // Send verification email in background so the registration endpoint
    // doesn't hang if the email provider is slow or unavailable.
    // Fire-and-forget; log errors but don't block the response.
    sendVerificationEmail(email, verificationCode)
      .then(() => console.log('Verification email sent to', email))
      .catch(err => console.error('Failed to send verification email (non-blocking):', err));

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registration successful. Please check your email for verification code.',
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.getDecryptedEmail(),
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Login
router.post('/login', [
  body('username').trim(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Attempt to find by username first, then by emailHash if username looks like an email
    let user = await User.findOne({ username });
    if (!user) {
      const crypto = require('crypto');
      const maybeEmail = (username || '').toLowerCase().trim();
      if (maybeEmail.includes('@')) {
        const emailHash = crypto.createHash('sha256').update(maybeEmail).digest('hex');
        user = await User.findOne({ emailHash });
      }
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.getDecryptedEmail(),
        verified: user.verified,
        subscribed: user.subscribed,
        winPoints: user.winPoints,
        matchesPlayed: user.matchesPlayed
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Verify email
router.post('/verify', authMiddleware, [
  body('code').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const { code } = req.body;
    const user = req.user;

    if (user.verified) {
      return res.status(400).json({ message: 'User already verified' });
    }

    if (!user.verifyCode(code)) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    user.verified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ message: 'Error verifying email' });
  }
});

// Resend verification code endpoint is disabled for now
// router.post('/resend-verification', authMiddleware, async (req, res) => {
//   try {
//     const user = req.user;
//
//     if (user.verified) {
//       return res.status(400).json({ message: 'User already verified' });
//     }
//
//     const verificationCode = user.generateVerificationCode();
//     await user.save();
//
//     // Send verification email in background (non-blocking).
//     sendVerificationEmail(user.getDecryptedEmail(), verificationCode)
//       .then(() => console.log('Resent verification email to', user.getDecryptedEmail()))
//       .catch(err => console.error('Failed to resend verification email (non-blocking):', err));
//
//     res.json({ message: 'Verification code sent' });
//   } catch (error) {
//     console.error('Resend verification error:', error);
//     res.status(500).json({ message: 'Error sending verification code' });
//   }
// });

// Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    try {
      const token = jwt.sign(
        { userId: req.user._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Redirect to app with token
      res.redirect(`${process.env.CLIENT_URL}?token=${token}`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }
  }
);

// Logout
router.post('/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      displayName: req.user.displayName,
      email: req.user.getDecryptedEmail(),
      verified: req.user.verified,
      subscribed: req.user.subscribed,
      winPoints: req.user.winPoints,
      matchesPlayed: req.user.matchesPlayed,
      settings: req.user.settings
    }
  });
});

// Update display name
router.put('/displayname', authMiddleware, [
  body('displayName').isLength({ min: 3, max: 30 }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { displayName } = req.body;
    const user = req.user;

    user.displayName = displayName;
    await user.save();

    res.json({
      message: 'Display name updated successfully',
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName
      }
    });
  } catch (error) {
    console.error('Update display name error:', error);
    res.status(500).json({ message: 'Error updating display name' });
  }
});

module.exports = router;
