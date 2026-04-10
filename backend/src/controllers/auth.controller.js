/**
 * @file backend/src/controllers/auth.controller.js
 * @description Authentication controller with register, login, logout, refresh, and profile
 * @author Dev A
 */

const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');
const jwtConfig = require('../config/jwt');
const User = require('../models/User');
const Role = require('../models/Role');
const { AppError } = require('../middleware/errorHandler');

/**
 * Extract the client IP address from the request.
 * Falls back through common proxy headers.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    null
  );
};

/**
 * POST /api/auth/register
 * Register a new user and return the created account.
 */
const register = async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body;

    if (!email || !password || !first_name || !last_name) {
      throw new AppError('Email, password, first_name, and last_name are required', 400);
    }

    const user = await authService.register({ email, password, first_name, last_name, phone });

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
 * Authenticate credentials, set refresh token in httpOnly cookie,
 * and return the access token in the response body.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const user = await authService.login(email, password);

    const accessToken = tokenService.generateAccessToken(user);
    const refreshToken = tokenService.generateRefreshToken();
    await tokenService.saveRefreshToken(user.id, refreshToken, getClientIp(req));

    res.cookie('refreshToken', refreshToken, jwtConfig.cookieOptions);

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
 * Revoke the refresh token and clear the cookie.
 */
const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken, getClientIp(req));
    }

    res.clearCookie('refreshToken', { path: jwtConfig.cookieOptions.path });

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
 * Rotate the refresh token and issue a new access token.
 */
const refreshToken = async (req, res, next) => {
  try {
    const oldRefreshToken = req.cookies?.refreshToken;

    if (!oldRefreshToken) {
      throw new AppError('Refresh token not provided', 401);
    }

    const { user, newRefreshToken } = await tokenService.rotateRefreshToken(
      oldRefreshToken,
      getClientIp(req)
    );

    const accessToken = tokenService.generateAccessToken(user);

    res.cookie('refreshToken', newRefreshToken, jwtConfig.cookieOptions);

    res.json({
      success: true,
      message: 'Token refreshed',
      data: { accessToken },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/profile
 * Return the authenticated user's profile with roles.
 * Requires authentication middleware to populate req.user.
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
