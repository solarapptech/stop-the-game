// Migration script: populate emailHash for existing users
// Usage: set environment variables MONGODB_URI and ENCRYPTION_KEY, then run:
// node scripts/migrate_email_hash.js

const mongoose = require('mongoose');
const CryptoJS = require('crypto-js');
const crypto = require('crypto');
const User = require('../models/User');

require('dotenv').config();

(async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/stop-the-game';
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB for migration');

    const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-chars!!';

    const users = await User.find({ $or: [ { emailHash: { $exists: false } }, { emailHash: null } ] });
    console.log(`Found ${users.length} users to migrate`);

    for (const user of users) {
      try {
        if (!user.email) {
          console.warn(`Skipping user ${user._id}: no email stored`);
          continue;
        }

        // Decrypt stored email
        const bytes = CryptoJS.AES.decrypt(user.email, encryptionKey);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (!decrypted) {
          console.warn(`Skipping user ${user._id}: failed to decrypt email`);
          continue;
        }

        const normalized = decrypted.toLowerCase().trim();
        const emailHash = crypto.createHash('sha256').update(normalized).digest('hex');
        user.emailHash = emailHash;
        await user.save();
        console.log(`Migrated user ${user._id} (${user.username})`);
      } catch (err) {
        console.error(`Error migrating user ${user._id}:`, err.message || err);
      }
    }

    console.log('Migration complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
