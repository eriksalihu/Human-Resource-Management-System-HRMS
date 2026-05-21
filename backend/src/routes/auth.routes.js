/**
 * @file backend/src/routes/auth.routes.js
 * @description Authentication API routes with endpoint-specific rate limits
 *   to mitigate brute-force, account-enumeration, and refresh-loop abuse
 * @author Dev A
 *
 * Why per-endpoint limits (not a single shared one)?
 *   The threat profile differs by endpoint:
 *     - /login           — high-volume brute force target → tightest cap
 *     - /register        — bot signup / spam vector → low absolute cap
 *     - /refresh-token   — legitimate clients hit it frequently (every
 *                          ~14 min for 15-min access tokens) so the cap
 *                          must accommodate normal traffic
 *     - /forgot-password — email-bombing vector → very low cap
 *
 *   A single `authLimiter` at 5/15min would punish legitimate refresh
 *   clients while leaving register / forgot-password under-protected.
 *
 * Limit configuration:
 *   Each limiter responds with structured JSON `{ success: false, ...,
 *   code: 'ERR_RATE_LIMITED', retry_after_seconds }` so the frontend's
 *   axios interceptor can branch on `err.response.data.code` exactly as
 *   it does for the granular auth errors from Day 36.
 *
 *   `skipSuccessfulRequests: true` on the login limiter means we only
 *   count failed sign-ins toward the limit — a legitimate user signing
 *   in many times across a 15-minute window (multi-tab, mobile + desktop)
 *   doesn't get penalized.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/auth');
const {
  emailChain,
  passwordChain,
  extractValidationErrors,
} = require('../middleware/validate');

const router = express.Router();

/**
 * Build a rate-limit middleware with the project's standard JSON 429
 * shape. `windowMs` + `max` configure the policy; the rest is shared.
 *
 * @param {Object} options
 * @param {number} options.windowMs
 * @param {number} options.max
 * @param {string} options.message - User-visible message included in the body
 * @param {boolean} [options.skipSuccessfulRequests=false]
 * @returns {import('express').RequestHandler}
 */
const makeLimiter = ({
  windowMs,
  max,
  message,
  skipSuccessfulRequests = false,
}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    // Custom handler so the response body matches the project's
    // AppError shape (`success / message / code`) rather than the
    // express-rate-limit default.
    handler: (req, res /* , next, options */) => {
      const retryAfterSec = Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({
        success: false,
        message,
        code: 'ERR_RATE_LIMITED',
        retry_after_seconds: retryAfterSec,
      });
    },
  });

/* ──────────────────────────────────────────────────────────────────── */
/* Per-endpoint limiters                                                 */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Login: 5 attempts / 15 minutes.
 * `skipSuccessfulRequests` so a legitimate user signing in many times
 * across the window (multi-tab, multi-device) isn't penalised. Failed
 * attempts compound with the per-account lockout from commit 204 — IP-
 * level limit here, account-level lockout there.
 */
const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message:
    'Too many failed sign-in attempts from this IP. Please try again in 15 minutes.',
  skipSuccessfulRequests: true,
});

/**
 * Register: 3 signups / hour. Combats automated account-creation bots
 * without blocking a small team onboarding several new hires in a day.
 */
const registerLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message:
    'Too many registration attempts from this IP. Please try again in an hour.',
});

/**
 * Refresh-token: 10 / minute. Legitimate clients refresh roughly every
 * 14 minutes (one minute before access-token expiry), so 10/minute is
 * an order of magnitude above normal — only abusive replay loops trip.
 */
const refreshLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message:
    'Too many token refresh requests. Please slow down and try again shortly.',
});

/**
 * Forgot-password: 3 / hour. The endpoint will trigger an email — the
 * tight limit keeps it from being used as an email-bombing vector
 * against arbitrary addresses.
 */
const forgotPasswordLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message:
    'Too many password-reset requests. Please try again in an hour.',
});

/* ──────────────────────────────────────────────────────────────────── */
/* Routes                                                                */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public — rate-limited 3/hour per IP
 */
router.post('/register', registerLimiter, authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and issue access + refresh tokens
 * @access  Public — rate-limited 5 failed attempts / 15 minutes per IP
 */
router.post('/login', loginLimiter, authController.login);

/**
 * @route   POST /api/auth/logout
 * @desc    Revoke refresh token and clear cookie
 * @access  Public (no auth required to clear client state)
 *
 * Not rate-limited: the request is idempotent and benign, and
 * limiting it would risk leaving stale sessions on the client.
 */
router.post('/logout', authController.logout);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Rotate refresh token and issue new access token
 * @access  Public (uses httpOnly refresh cookie) — rate-limited 10/min
 */
router.post('/refresh-token', refreshLimiter, authController.refreshToken);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Begin a password reset — emails a one-hour, single-use link.
 * @access  Public — rate-limited 3/hour per IP
 *
 * Always returns the same neutral 200 so it can't be used to enumerate
 * which emails are registered.
 */
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  emailChain(),
  extractValidationErrors,
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Complete a password reset with the token from the email link.
 * @access  Public — rate-limited (reuses the forgot-password limiter)
 *
 * Body: { token: string, password: string }. The new password must meet
 * the same strength rules as registration.
 */
router.post(
  '/reset-password',
  forgotPasswordLimiter,
  passwordChain('password'),
  extractValidationErrors,
  authController.resetPassword
);

/**
 * @route   GET /api/auth/profile
 * @desc    Get authenticated user's profile with roles
 * @access  Private (Bearer token required)
 */
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;
