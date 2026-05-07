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
const { AppError } = require('../middleware/errorHandler');

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
 * Authenticate credentials, set the refresh token in a hardened
 * httpOnly cookie, and return a fingerprint-bound access token in the
 * response body.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const user = await authService.login(email, password);

    // Bind the access token to the issuing client's UA + IP via fingerprint.
    // The auth middleware verifies this on subsequent requests so a stolen
    // bearer token can't be replayed from a different machine.
    const accessToken = tokenService.generateAccessToken(user, { req });
    const refreshToken = tokenService.generateRefreshToken();
    await tokenService.saveRefreshToken(user.id, refreshToken, getClientIp(req));

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
