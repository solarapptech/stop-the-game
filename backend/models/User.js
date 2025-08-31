const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const CryptoJS = require('crypto-js');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: {
    type: String,
    required: function() {
      return this.authMethod === 'local';
    }
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
    // No regex validator: email is encrypted before storage
  },
  // Deterministic hash of the lowercase email for lookups (searchable while keeping encrypted email private)
  emailHash: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  authMethod: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleId: {
    type: String,
    sparse: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String,
    default: null
  },
  verificationCodeExpires: {
    type: Date,
    default: null
  },
  settings: {
    soundEnabled: {
      type: Boolean,
      default: true
    },
    musicEnabled: {
      type: Boolean,
      default: true
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  winPoints: {
    type: Number,
    default: 0
  },
  matchesPlayed: {
    type: Number,
    default: 0
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  subscribed: {
    type: Boolean,
    default: false
  },
  subscriptionId: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Encrypt sensitive fields before saving
userSchema.pre('save', async function(next) {
  const user = this;
  
  // Hash password if modified
  if (user.isModified('password') && user.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(user.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  
  // Encrypt email if modified
  if (user.isModified('email')) {
    const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-chars!!';

    // compute deterministic hash for lookups
    try {
      const normalized = (user.email || '').toLowerCase().trim();
      user.emailHash = crypto.createHash('sha256').update(normalized).digest('hex');
    } catch (err) {
      return next(err);
    }

    // encrypt the email for storage
    user.email = CryptoJS.AES.encrypt(user.email, encryptionKey).toString();
  }
  
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to decrypt email
userSchema.methods.getDecryptedEmail = function() {
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-chars!!';
  const bytes = CryptoJS.AES.decrypt(this.email, encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
};

// Method to generate verification code
userSchema.methods.generateVerificationCode = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verificationCode = code;
  this.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return code;
};

// Method to verify code
userSchema.methods.verifyCode = function(code) {
  if (!this.verificationCode || !this.verificationCodeExpires) {
    return false;
  }
  
  if (new Date() > this.verificationCodeExpires) {
    return false;
  }
  
  return this.verificationCode === code;
};

// Virtual for display name
userSchema.virtual('displayName').get(function() {
  return this.username;
});

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.verificationCode;
  delete user.verificationCodeExpires;
  // Decrypt email for response
  if (user.email) {
    const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-chars!!';
    const bytes = CryptoJS.AES.decrypt(user.email, encryptionKey);
    user.email = bytes.toString(CryptoJS.enc.Utf8);
  }
  // Remove internal hash from public JSON
  delete user.emailHash;
  return user;
};

module.exports = mongoose.model('User', userSchema);
