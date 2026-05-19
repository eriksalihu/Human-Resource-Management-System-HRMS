/**
 * @file backend/src/config/cors.js
 * @description CORS configuration with a multi-origin production
 *   whitelist and the full set of headers the SPA actually sends.
 * @author Dev A
 *
 * Production fixes (commit 277):
 *   - `CORS_ORIGIN` is now a COMMA-SEPARATED whitelist, validated via
 *     an `origin` callback, so prod + staging + localhost can all be
 *     allowed without a wildcard (a wildcard is incompatible with
 *     `credentials: true` anyway — browsers reject `*` + cookies).
 *   - `allowedHeaders` now includes `x-request-id` and `x-csrf-token`.
 *     The axios interceptor stamps `x-request-id` on every request;
 *     the old two-header allowlist made the browser's preflight fail
 *     in production with "Request header field x-request-id is not
 *     allowed by Access-Control-Allow-Headers".
 *   - `exposedHeaders` lets the SPA read the echoed `x-request-id`
 *     for log correlation.
 *   - `OPTIONS` + `optionsSuccessStatus: 204` + `maxAge` so preflights
 *     are cheap and don't 404 on legacy browsers.
 */

/**
 * Parse the env whitelist. Accepts a single origin or a comma list:
 *   CORS_ORIGIN="https://hrms.ubt-uni.net,https://staging.hrms.ubt-uni.net"
 * Falls back to the Vite dev origin when unset.
 */
const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGIN || 'http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Origin validator. Allows:
 *   - requests with no Origin header (curl, server-to-server, health
 *     checks, same-origin navigations) — there's no cookie/CORS risk
 *     since the browser only enforces CORS when an Origin is present
 *   - any origin in the whitelist
 * Everything else is rejected with a CORS error.
 *
 * @param {string|undefined} origin
 * @param {(err: Error|null, allow?: boolean) => void} callback
 */
const originValidator = (origin, callback) => {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`Origin ${origin} not allowed by CORS`));
};

const corsOptions = {
  origin: originValidator,
  credentials: true, // allows the httpOnly refresh-token cookie
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-request-id',
    'x-csrf-token',
  ],
  exposedHeaders: ['x-request-id'],
  // 204 keeps preflight responses body-less; some legacy browsers
  // choke on a 200 with no content.
  optionsSuccessStatus: 204,
  // Cache the preflight result for 10 minutes to cut OPTIONS chatter.
  maxAge: 600,
};

module.exports = corsOptions;
module.exports.ALLOWED_ORIGINS = ALLOWED_ORIGINS;
