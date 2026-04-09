/**
 * @file backend/src/config/jwt.js
 * @description JWT configuration with token secrets, expiry, and cookie options
 * @author Dev A
 */

require('dotenv').config();

const jwtConfig = {
  /** Access token secret from environment */
  accessTokenSecret: process.env.JWT_SECRET,

  /** Refresh token secret from environment */
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET,

  /** Access token expiry — short-lived (15 minutes) */
  accessTokenExpiry: process.env.JWT_EXPIRE || '15m',

  /** Refresh token expiry — long-lived (7 days) */
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRE || '7d',

  /** Refresh token expiry in milliseconds (for DB storage) */
  refreshTokenExpiryMs: 7 * 24 * 60 * 60 * 1000,

  /**
   * Cookie options for refresh token storage.
   * httpOnly prevents JavaScript access (XSS protection).
   * secure ensures cookies are sent only over HTTPS in production.
   * sameSite prevents CSRF attacks.
   */
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
  },
};

module.exports = jwtConfig;
