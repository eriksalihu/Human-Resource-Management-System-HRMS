/**
 * @file backend/src/config/jwt.js
 * @description JWT configuration with token secrets, expiry, and cookie options
 * @author Dev A
 */

require('dotenv').config();

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Resolve the refresh-cookie SameSite + Secure pair (commit 277).
 *
 * The bug: a hardcoded `sameSite: 'strict'` meant the browser dropped
 * the refresh cookie on any cross-site request — which is exactly the
 * production topology (SPA on app.<domain>, API on api.<domain>). The
 * silent-refresh `POST /auth/refresh-token` from the SPA would arrive
 * with NO cookie, so users got logged out after the access token
 * expired.
 *
 * Correct behavior:
 *   - Cross-site credentialed cookies REQUIRE `SameSite=None` AND
 *     `Secure` (browsers reject `SameSite=None` without `Secure`).
 *   - In dev (http://localhost) `Secure` can't be set, so we use
 *     `Lax`, which still works because the SPA and API share
 *     localhost (same-site).
 *   - `COOKIE_SAMESITE` env allows an explicit override for same-site
 *     production deploys (where `Lax` is preferable + CSRF-safer).
 *
 * @returns {{ sameSite: 'none'|'lax'|'strict', secure: boolean }}
 */
const resolveCookieSecurity = () => {
  const override = (process.env.COOKIE_SAMESITE || '').toLowerCase();
  if (['none', 'lax', 'strict'].includes(override)) {
    return { sameSite: override, secure: override === 'none' || IS_PROD };
  }
  if (IS_PROD) {
    // Default prod assumption: SPA and API on different sub-domains.
    return { sameSite: 'none', secure: true };
  }
  // Dev over plain http — Secure cookies would never be sent.
  return { sameSite: 'lax', secure: false };
};

const { sameSite: COOKIE_SAMESITE, secure: COOKIE_SECURE } =
  resolveCookieSecurity();

const jwtConfig = {
  /** Access token secret from environment */
  accessTokenSecret: process.env.JWT_SECRET || 'hrms_jwt_secret_key_dev_2026',

  /** Refresh token secret from environment */
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'hrms_jwt_refresh_secret_key_dev_2026',

  /** Access token expiry — short-lived (15 minutes) */
  accessTokenExpiry: process.env.JWT_EXPIRE || '15m',

  /** Refresh token expiry — long-lived (7 days) */
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRE || '7d',

  /** Refresh token expiry in milliseconds (for DB storage) */
  refreshTokenExpiryMs: 7 * 24 * 60 * 60 * 1000,

  /**
   * Cookie options for refresh-token storage.
   *   - httpOnly: no JS access (XSS mitigation)
   *   - secure + sameSite: resolved per-environment so the cookie
   *     actually survives the production cross-site refresh flow
   *     (see resolveCookieSecurity above)
   *   - path '/': sent to /auth/refresh-token and /auth/logout alike
   */
  cookieOptions: {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
  },
};

module.exports = jwtConfig;
