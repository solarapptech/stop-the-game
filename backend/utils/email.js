const { Resend } = require('resend');

const RESEND_KEY = process.env.RESEND_API_KEY;
let resend = null;
if (RESEND_KEY && RESEND_KEY.trim().length > 0) {
  resend = new Resend(RESEND_KEY);
} else {
  console.log('[email] RESEND_API_KEY not set; email sending is disabled');
}

const sendVerificationEmail = async (email, code) => {
  try {
    if (!resend) {
      // No-op when email sending is disabled
      console.log('[email] Skipping verification email send (email disabled)');
      return { skipped: true };
    }
    const { data, error } = await resend.emails.send({
      from: 'Stop! The Game <noreply@stopthegame.com>',
      to: email,
      subject: 'Verify your Stop! The Game account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">Stop! The Game</h1>
          <div style="background-color: #f4f4f4; padding: 20px; border-radius: 10px;">
            <h2 style="color: #555;">Verify Your Account</h2>
            <p style="color: #666; font-size: 16px;">
              Thank you for registering! Please use the verification code below to verify your account:
            </p>
            <div style="background-color: #fff; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; color: #4CAF50; letter-spacing: 5px;">
                ${code}
              </span>
            </div>
            <p style="color: #999; font-size: 14px;">
              This code will expire in 10 minutes. If you didn't request this, please ignore this email.
            </p>
          </div>
          <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
            © 2024 Stop! The Game. All rights reserved.
          </p>
        </div>
      `
    });

    if (error) {
      const invalidKey = error?.statusCode === 401 || /api key is invalid/i.test(String(error?.message || ''));
      if (invalidKey) {
        console.warn('[email] Invalid API key; skipping verification email');
        return { skipped: true };
      }
      console.error('Email send error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    const invalidKey = error?.statusCode === 401 || /api key is invalid/i.test(String(error?.message || ''));
    if (invalidKey) {
      console.warn('[email] Invalid API key on send; skipping verification email');
      return { skipped: true };
    }
    console.error('Failed to send verification email:', error);
    throw error;
  }
};

const sendGameInviteEmail = async (email, inviterName, roomName, inviteCode) => {
  try {
    if (!resend) {
      console.log('[email] Skipping invite email send (email disabled)');
      return { skipped: true };
    }
    const { data, error } = await resend.emails.send({
      from: 'Stop! The Game <noreply@stopthegame.com>',
      to: email,
      subject: `${inviterName} invited you to play Stop! The Game`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">Stop! The Game</h1>
          <div style="background-color: #f4f4f4; padding: 20px; border-radius: 10px;">
            <h2 style="color: #555;">Game Invitation</h2>
            <p style="color: #666; font-size: 16px;">
              <strong>${inviterName}</strong> has invited you to join their game room: <strong>${roomName}</strong>
            </p>
            <div style="background-color: #fff; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
              <p style="color: #666;">Room Code:</p>
              <span style="font-size: 28px; font-weight: bold; color: #2196F3; letter-spacing: 3px;">
                ${inviteCode}
              </span>
            </div>
            <p style="color: #666; font-size: 14px;">
              To join the game:
            </p>
            <ol style="color: #666; font-size: 14px;">
              <li>Open Stop! The Game app</li>
              <li>Click on "Join Room"</li>
              <li>Enter the room code above</li>
            </ol>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.CLIENT_URL}/join/${inviteCode}" 
                 style="background-color: #4CAF50; color: white; padding: 12px 30px; 
                        text-decoration: none; border-radius: 5px; font-size: 16px;">
                Join Game Now
              </a>
            </div>
          </div>
          <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
            © 2024 Stop! The Game. All rights reserved.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('Email send error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    const invalidKey = error?.statusCode === 401 || /api key is invalid/i.test(String(error?.message || ''));
    if (invalidKey) {
      console.warn('[email] Invalid API key on send; skipping invite email');
      return { skipped: true };
    }
    console.error('Failed to send invite email:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendGameInviteEmail
};
