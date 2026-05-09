/**
 * @file backend/src/middleware/csrfProtection.js
 * @description CSRF protection using the double-submit cookie pattern
 *   with header verification, scoped to cookie-authenticated requests
 *   (Bearer-authed API calls are inherently CSRF-immune)
 * @author Dev A
 *
 * How double-submit cookie works:
 *   1. On login, the server sets a non-httpOnly `csrfToken` cookie with
 *      a cryptographically random value
 *   2. The SPA reads that cookie via `document.cookie` and echoes it on
 *      every state-changing request as the `x-csrf-token` header
 *   3. The server compares header vs. cookie. They match → legitimate
 *      same-site request. They differ → reject as CSRF.
 *
 * Why it works:
 *   - A cross-origin attacker cannot read or write the victim's cookies
 *     (same-origin policy), so they can't reproduce the cookie value in
 *     the header. Their forged request still ships the cookie because
 *     browsers attach cookies to cross-origin requests automatically,
 *     but the header they fake will never match.
 *
 * Why we exempt Bearer auth:
 *   - Cross-site CSRF requires the browser to attach credentials
 *     automatically. Authorization headers are NOT sent automatically by
 *     browsers — only cookies are. Bearer-authed XHR requests therefore
 *     can't be forged by a third party site, so the CSRF token check is
 *     unnecessary and would just add friction to API consumers.
 *   - Public endpoints (login, register) are also exempt — the user
 *     hasn't gotten a CSRF token yet, and these endpoints aren't
 *     state-changing in the "modify the victim's data" sense.
 *
 * Token strategy:
 *   - 32 bytes of crypto.randomBytes → 64 hex chars
 *   - Constant-time comparison via `crypto.timingSafeEqual`
 *   - Token rotates on login / logout (not on every request — that
 *     would break tabs that have a request in flight when a different
 *     tab triggers a token rotation)
 */

const crypto = require('crypto');
const { AppError } = require('./errorHandler');

/** Cookie name carrying the CSRF token. */
const CSRF_COOKIE_NAME = 'csrfToken';

/** Header name expected on state-changing requests. */
const CSRF_HEADER_NAME = 'x-csrf-token';

/** Methods that DON'T mutate state — exempt from CSRF check. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Path prefixes exempt from CSRF check (login / register / refresh). */
const EXEMPT_PATH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh-token',
  '/api/auth/forgot-password',
  '/api/health',
];

/**
 * Generate a fresh CSRF token. Hex-encoded 64 characters.
 *
 * @returns {string}
 */
const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

/**
 * Cookie options for the CSRF cookie. Crucially `httpOnly: false` so
 * the SPA's JS can read it and echo it in the header — that's the
 * whole point of double-submit. `sameSite: 'strict'` keeps it from
 * leaking on cross-site navigations.
 *
 * @param {Object} [overrides]
 * @returns {Object}
 */
const csrfCookieOptions = (overrides = {}) => ({
  httpOnly: false, // intentional — JS must read this
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  // CSRF cookie ships on every API call so the SPA can grab it.
  path: '/',
  // Match the access-token expiry so the cookie life roughly tracks
  // the session. The cookie is non-sensitive (random opaque string),
  // so the long expiry isn't a meaningful attack surface.
  maxAge: 24 * 60 * 60 * 1000,
  ...overrides,
});

/**
 * Constant-time comparison helper. Returns false (rather than throwing)
 * on mismatched lengths so the caller can treat result-or-false as
 * "valid?" without exception handling.
 */
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

/**
 * Issue a CSRF token: generate one, set it as a cookie, and return the
 * value to the caller. Auth controllers call this on login / refresh.
 *
 * @param {import('express').Response} res
 * @returns {string} The token value (also set as a cookie)
 */
const issueToken = (res) => {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
};

/**
 * Clear the CSRF cookie. Auth controllers call this on logout.
 *
 * @param {import('express').Response} res
 */
const clearToken = (res) => {
  res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions({ maxAge: 0 }));
};

/**
 * Decide whether a given request should bypass CSRF validation.
 *
 *   - Safe HTTP methods (GET / HEAD / OPTIONS) — never CSRF-vulnerable
 *   - Bearer-authed requests — the Authorization header isn't sent
 *     automatically by browsers, so they can't be cross-site forged
 *   - Exempt paths (login, register, refresh, etc.) — listed above
 */
const shouldSkip = (req) => {
  if (SAFE_METHODS.has(req.method)) return true;

  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return true;

  const url = req.originalUrl || req.url || '';
  for (const prefix of EXEMPT_PATH_PREFIXES) {
    if (url.startsWith(prefix)) return true;
  }
  return false;
};

/**
 * Express middleware factory. Returns the verifier to mount globally
 * after the cookie parser.
 *
 * Usage:
 *   const csrf = require('./middleware/csrfProtection');
 *   app.use(csrf());
 *
 * @param {Object} [options]
 * @param {string[]} [options.exemptPathPrefixes] - Append to default exemptions
 * @returns {import('express').RequestHandler}
 */
const csrfProtection = (options = {}) => {
  const extraExemptions = options.exemptPathPrefixes || [];

  return (req, _res, next) => {
    // Fast path: skip when not applicable.
    if (shouldSkip(req)) return next();
    if (extraExemptions.some((p) => (req.originalUrl || '').startsWith(p))) {
      return next();
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken =
      req.headers[CSRF_HEADER_NAME] ||
      req.headers[CSRF_HEADER_NAME.toLowerCase()];

    if (!cookieToken || !headerToken) {
      const err = new AppError(
        'CSRF token missing — refresh the page and try again',
        403
      );
      err.code = 'ERR_CSRF_TOKEN_MISSING';
      return next(err);
    }

    if (!safeCompare(cookieToken, headerToken)) {
      const err = new AppError(
        'CSRF token mismatch — refresh the page and try again',
        403
      );
      err.code = 'ERR_CSRF_TOKEN_MISMATCH';
      return next(err);
    }

    return next();
  };
};

module.exports = csrfProtection;
module.exports.issueToken = issueToken;
module.exports.clearToken = clearToken;
module.exports.generateCsrfToken = generateCsrfToken;
module.exports.csrfCookieOptions = csrfCookieOptions;
module.exports.CSRF_COOKIE_NAME = CSRF_COOKIE_NAME;
module.exports.CSRF_HEADER_NAME = CSRF_HEADER_NAME;
