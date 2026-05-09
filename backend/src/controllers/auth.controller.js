/**
 * @file backend/src/controllers/auth.controller.js
 * @description Authentication controller — register / login / logout / refresh / profile, with hardened refresh-token cookie configuration and request-bound access-token fingerprints
 * @author Dev A
 *
 * Cookie security:
 *   - `httpOnly: true` — JavaScript can't read or steal the cookie (XSS guard)
 *   - `secure` — HTTPS-only in production (rejects MITM downgrade attacks)
 *   - `sameSite: 'strict'` — never sent on cross-site requests (CSRF guard)
 *   - `path: '/api/auth'` — scoped to auth routes so the cookie doesn't
 *     ship on every API request, reducing exposure surface
 *   - `clearCookie` mirrors the same options so the browser actually
 *     drops the cookie on logout (mismatched options leave it stuck)
 */

const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');
const jwtConfig = require('../config/jwt');
const User = require('../models/User');
const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');
const { AppError } = require('../middleware/errorHandler');

/**
 * Lockout policy. Five strikes locks the account for fifteen minutes;
 * the counter resets on every successful login.
 *
 * These are deliberately not env vars — changing the policy at runtime
 * would let a misconfigured deploy silently disable lockout entirely.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Best-effort audit log write. Wrapped so a failed audit insert never
 * affects the credential-validation flow — the user-facing response
 * stays the same whether or not the audit row landed.
 */
const auditFailedLogin = async ({ userId, email, ip, reason }) => {
  try {
    await AuditLog.create({
      user_id: userId ?? null,
      action: 'POST /api/auth/login [FAILED]',
      entity: 'Users',
      entity_id: userId ?? null,
      old_values: null,
      new_values: { email, reason },
      ip_address: ip,
    });
  } catch (err) {
    // Audit shouldn't break login; just log and move on.
    // eslint-disable-next-line no-console
    console.error('[auth.login] audit log failed:', err.message);
  }
};

/**
 * Format the locked-out error response. Includes the unlock timestamp
 * so the frontend can render a "try again in X minutes" countdown.
 */
const lockoutError = (lockedUntil) => {
  const minutes = Math.max(
    1,
    Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000)
  );
  const err = new AppError(
    `Account locked due to too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    423 // Locked
  );
  err.code = 'ERR_ACCOUNT_LOCKED';
  err.locked_until = lockedUntil;
  return err;
};

/**
 * Build the refresh-token cookie options. Centralised here so login,
 * refresh, and logout all attach (and clear) the cookie with identical
 * attributes — mismatch means the browser keeps the stale cookie around.
 *
 * @param {Object} [overrides] - Optional per-call overrides (e.g. maxAge: 0)
 * @returns {Object} cookie options for res.cookie / res.clearCookie
 */
const refreshCookieOptions = (overrides = {}) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  // Scope the cookie to the auth routes — every other endpoint doesn't
  // need it, and a narrower path means a smaller attack surface.
  path: '/api/auth',
  maxAge: jwtConfig.refreshTokenExpiryMs,
  ...overrides,
});

/**
 * Extract the client IP, honouring `x-forwarded-for` when behind a
 * reverse proxy. Used both for audit (saved on the RefreshTokens row)
 * and to compute the access-token fingerprint.
 */
const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.ip ||
  req.connection?.remoteAddress ||
  null;

/**
 * POST /api/auth/register
 * Register a new user and return the created account.
 */
const register = async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body;

    if (!email || !password || !first_name || !last_name) {
      throw new AppError(
        'Email, password, first_name, and last_name are required',
        400
      );
    }

    const user = await authService.register({
      email,
      password,
      first_name,
      last_name,
      phone,
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 *
 * Flow:
 *   1. Pre-flight: check `locked_until`. If still in the lockout window,
 *      reject with 423 Locked + an unlock timestamp.
 *   2. Authenticate via authService.login. On failure, increment the
 *      counter; on the 5th strike set `locked_until = now + 15 min`.
 *      Audit each failed attempt for forensics.
 *   3. On success, reset the counter, record `last_login_at` /
 *      `last_login_ip`, and issue tokens as before.
 *
 * The 5-attempt window is deliberately small — for HR systems the
 * brute-force exposure risk outweighs the usability cost.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = getClientIp(req);

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    // (1) — Pre-flight lockout check. We look up the user explicitly
    // here (auth service does the same lookup, but we need the lockout
    // state BEFORE we compare passwords — comparing for a locked account
    // would still give an attacker a timing oracle).
    const existing = await User.findByEmail(email);
    if (existing && typeof User.isLocked === 'function') {
      const locked = await User.isLocked(existing.id);
      if (locked.locked) {
        await auditFailedLogin({
          userId: existing.id,
          email,
          ip,
          reason: 'attempted_during_lockout',
        });
        return next(lockoutError(locked.locked_until));
      }
    }

    // (2) — Validate credentials.
    let user;
    try {
      user = await authService.login(email, password);
    } catch (err) {
      // Bad credentials → increment the failed-attempts counter on the
      // matching user row (if any). We deliberately don't reveal whether
      // the email exists — the response stays the same.
      if (existing && typeof User.incrementFailedAttempts === 'function') {
        const result = await User.incrementFailedAttempts(existing.id, {
          maxAttempts: MAX_FAILED_ATTEMPTS,
          lockoutDurationMs: LOCKOUT_DURATION_MS,
        });
        await auditFailedLogin({
          userId: existing.id,
          email,
          ip,
          reason: 'bad_credentials',
        });

        if (result?.locked_until) {
          return next(lockoutError(result.locked_until));
        }
      } else {
        await auditFailedLogin({
          userId: null,
          email,
          ip,
          reason: 'unknown_user',
        });
      }
      // Re-throw the original auth error (preserves 401).
      return next(err);
    }

    // (3) — Success path: reset counter + record session metadata.
    if (typeof User.recordSuccessfulLogin === 'function') {
      await User.recordSuccessfulLogin(user.id, ip);
    }

    // Bind the access token to the issuing client's UA + IP via fingerprint.
    // The auth middleware verifies this on subsequent requests so a stolen
    // bearer token can't be replayed from a different machine.
    const accessToken = tokenService.generateAccessToken(user, { req });
    const refreshToken = tokenService.generateRefreshToken();
    await tokenService.saveRefreshToken(user.id, refreshToken, ip);

    res.cookie('refreshToken', refreshToken, refreshCookieOptions());

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Revoke the refresh token, blacklist the access token's jti, and clear
 * the cookie with matching options so the browser actually drops it.
 */
const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken, getClientIp(req));
    }

    // If the access middleware ran first, req.user.jti is populated —
    // blacklist it so the access token's remaining lifetime is unusable.
    // (Falls through gracefully when there's no jti.)
    if (req.user?.jti) {
      // Best-effort decode of the bearer to grab `exp` for sweep eviction.
      const header = req.headers.authorization;
      if (header && header.startsWith('Bearer ')) {
        try {
          const decoded = tokenService.verifyAccessToken(
            header.slice('Bearer '.length).trim()
          );
          tokenService.blacklistAccessToken(decoded.jti, decoded.exp);
        } catch {
          // Token's already invalid — nothing to blacklist.
        }
      }
    }

    // Clear the cookie with EXACTLY the options that set it. Browsers
    // require the same path / sameSite / secure flags to drop a cookie.
    res.clearCookie('refreshToken', refreshCookieOptions({ maxAge: 0 }));

    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh-token
 * Rotate the refresh token and issue a fresh fingerprint-bound access
 * token. Returns 401 with `code: ERR_REFRESH_REUSE_DETECTED` if the old
 * token has already been rotated — at which point the entire token
 * family was nuked by the token service.
 */
const refreshToken = async (req, res, next) => {
  try {
    const oldRefreshToken = req.cookies?.refreshToken;

    if (!oldRefreshToken) {
      const err = new AppError('Refresh token not provided', 401);
      err.code = 'ERR_REFRESH_MISSING';
      throw err;
    }

    const { user, newRefreshToken } = await tokenService.rotateRefreshToken(
      oldRefreshToken,
      getClientIp(req)
    );

    const accessToken = tokenService.generateAccessToken(user, { req });

    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions());

    res.json({
      success: true,
      message: 'Token refreshed',
      data: { accessToken },
    });
  } catch (err) {
    // On any refresh failure, also clear the (now-known-bad) cookie so
    // the client doesn't keep retrying with the same dead value.
    if (err.code?.startsWith('ERR_REFRESH_')) {
      res.clearCookie('refreshToken', refreshCookieOptions({ maxAge: 0 }));
    }
    next(err);
  }
};

/**
 * GET /api/auth/profile
 * Return the authenticated user's profile with roles. Requires the
 * authenticate middleware to populate req.user.
 */
const getProfile = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const roles = await Role.getUserRoles(user.id);
    user.roles = roles.map((r) => r.name);

    res.json({
      success: true,
      data: { user },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, logout, refreshToken, getProfile };
module.exports.refreshCookieOptions = refreshCookieOptions;
