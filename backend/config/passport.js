const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists with this Google ID
    let user = await User.findOne({ googleId: profile.id });
    
    if (user) {
      return done(null, user);
    }
    
    // Check if user exists with this email
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-chars!!';
  const CryptoJS = require('crypto-js');
  const crypto = require('crypto');

  // Compute emailHash for lookup
  const normalized = (profile.emails[0].value || '').toLowerCase().trim();
  const emailHash = crypto.createHash('sha256').update(normalized).digest('hex');

  user = await User.findOne({ emailHash });
    
    if (user) {
      // Link Google account to existing user
      user.googleId = profile.id;
      user.authMethod = 'google';
      user.verified = true;
      await user.save();
      return done(null, user);
    }
    
    // Create new user
    user = await User.create({
      googleId: profile.id,
      username: profile.displayName.replace(/\s+/g, '_').toLowerCase(),
      email: profile.emails[0].value,
      emailHash,
      authMethod: 'google',
      verified: true
    });
    
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
