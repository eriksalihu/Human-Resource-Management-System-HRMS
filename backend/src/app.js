/**
 * @file backend/src/app.js
 * @description Express application setup with middleware stack and route mounting
 * @author Dev A
 *
 * Middleware order matters and is intentional:
 *   1. Trust proxy (so req.ip honors X-Forwarded-For when behind a proxy)
 *   2. Security headers (helmet) — set before any response is generated
 *   3. CORS — must precede body parsers so preflight responds without parsing
 *   4. Compression — applies to every successful response
 *   5. Logging — captures everything below it
 *   6. Body / cookie parsing with strict size limits
 *   7. Sanitization — runs AFTER body parsing, BEFORE controllers
 *   8. Routes — each router applies its own auth + role guards
 *   9. 404 fallback (scoped to /api)
 *  10. Error handler — must be last
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const corsOptions = require('./config/cors');
const errorHandler = require('./middleware/errorHandler');
const securityHeaders = require('./middleware/helmet');
const sanitize = require('./middleware/sanitize');

/**
 * Body-size limits.
 *   - JSON / urlencoded: 1 MB. Plenty for any HRMS payload (the largest
 *     CRUD body — bulk salary creation — clocks in around 50 KB).
 *     Locking it down stops a malicious caller from sending a 100 MB
 *     JSON to chew through memory.
 *   - File uploads: 10 MB enforced at the multer layer (see
 *     `controllers/document.controller.js`). The JSON limit doesn't
 *     apply to multipart bodies since multer parses the stream itself.
 */
const JSON_BODY_LIMIT = '1mb';
const URLENCODED_BODY_LIMIT = '1mb';

const app = express();

// ==================== Trust Proxy ====================
// One hop is the typical setup for a single reverse proxy (nginx,
// Cloudflare). Update if you sit behind multiple layers — the value
// drives `req.ip`, which feeds rate-limiting and audit logs.
app.set('trust proxy', 1);

// ==================== HTTPS Redirect ====================
// In production behind a TLS-terminating proxy (nginx / Cloudflare /
// load balancer), the app receives plain HTTP and the original scheme
// is in `x-forwarded-proto`. Bounce any HTTP request to HTTPS so the
// `Secure` refresh cookie is actually usable and links stay https.
// `trust proxy` (above) makes `req.secure` honour the forwarded proto.
// Skipped entirely outside production so local http dev still works.
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isHttps =
      req.secure || forwardedProto === 'https';
    if (isHttps) return next();
    // Preserve method semantics: 308 keeps POST/PUT bodies intact on
    // the redirect (a plain 301/302 would downgrade them to GET).
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// Drop the `X-Powered-By: Express` header explicitly. Helmet does this
// too, but having it before helmet kicks in covers any pre-helmet path.
app.disable('x-powered-by');

// ==================== Security Middleware ====================
// `securityHeaders()` is our project-wrapped Helmet (CSP, HSTS,
// frame-ancestors, etc.). Configured per-environment internally.
app.use(securityHeaders());
app.use(cors(corsOptions));

// ==================== Global Rate Limit ====================
// Baseline per-IP ceiling on the whole API (commit 305 security pass).
// The auth endpoints keep their own much stricter limiters layered on
// top of this; this catch-all just prevents any non-auth endpoint from
// being hammered without bound. Generous enough that a normal session
// (dashboard + list browsing) never trips it. Health checks are exempt
// so monitors/load balancers aren't throttled. The body matches the
// `ERR_RATE_LIMITED` shape the frontend's 429 handler already expects.
const GLOBAL_RATE_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_RATE_MAX = 600;
app.use(
  '/api',
  rateLimit({
    windowMs: GLOBAL_RATE_WINDOW_MS,
    max: GLOBAL_RATE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    handler: (req, res) => {
      const retryAfterSec = Math.ceil(GLOBAL_RATE_WINDOW_MS / 1000);
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down and try again shortly.',
        statusCode: 429,
        code: 'ERR_RATE_LIMITED',
        retry_after_seconds: retryAfterSec,
      });
    },
  })
);

// ==================== Compression + Logging ====================
// Compression tuned for JSON-heavy API traffic:
//   - `threshold: 1024` skips compressing responses smaller than 1 KB
//     (the gzip header itself + CPU cost exceeds the savings for tiny
//     payloads — list endpoints, dashboard widgets, etc. are well above
//     this floor)
//   - `level: 6` is the zlib default — best size/CPU trade-off
//   - `filter` skips compression when the client opts out via
//     `x-no-compression: true` (handy for streaming endpoints / debugging)
app.use(
  compression({
    threshold: 1024,
    level: 6,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  })
);

// ==================== ETag + Cache Headers ====================
// Express has ETag generation built in; we set the strong variant so
// caches do byte-equality comparison rather than the weak/timestamp
// heuristic. Combined with the per-route Cache-Control middleware below,
// this gives the SPA's axios layer enough information to do conditional
// requests when we eventually wire them up.
app.set('etag', 'strong');

/**
 * Cache-Control policy:
 *   - **API responses** (everything under `/api`, except `/api/health`)
 *     get `no-store` so HR data is never served from a shared cache.
 *     Sensitive fields and per-user payloads don't belong in a CDN.
 *   - **`/api/health`** gets a short 10-second cache so liveness probes
 *     don't hammer the DB. The check itself is read-only and any
 *     legitimate caller is fine with 10s of staleness.
 *
 * Static-asset cache headers (when we eventually serve the SPA build
 * from Express) would slot in below as a separate middleware mounted
 * before the API routes — `express.static({ maxAge: '1y', immutable: true })`
 * for hashed filenames. The Vite dev server handles that itself today,
 * so we don't repeat it here.
 */
app.use((req, res, next) => {
  if (req.path === '/api/health') {
    res.set('Cache-Control', 'public, max-age=10');
  } else if (req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

app.use(morgan('dev'));

// ==================== Body Parsing ====================
// Cookie parser must run before any handler that reads `req.cookies`
// (refresh-token cookie on /api/auth routes).
app.use(cookieParser());
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(
  express.urlencoded({
    extended: true,
    limit: URLENCODED_BODY_LIMIT,
  })
);

// ==================== Input Length Guard ====================
// Belt-and-braces defense (commit 284): reject any request whose body
// contains a string field longer than the global cap, BEFORE it reaches
// sanitisation / validation / controllers. Keeps pathological payloads
// (and accidental gigabyte pastes) from ever touching the DB driver,
// even on endpoints that haven't wired field-specific validation.
const { bodyStringLimit } = require('./middleware/validate');
app.use(bodyStringLimit());

// ==================== Input Sanitization ====================
// Walks req.body / req.query / req.params, trimming whitespace,
// escaping HTML entities, and stripping `$`-prefixed operator keys.
// Routes that need to accept raw HTML (none today) can opt out via
// `sanitize({ skipFields: ['richText'] })` mounted on that router.
app.use(sanitize());

// ==================== Health Check ====================
// Mounted before the auth-protected routes so liveness probes don't
// need credentials. The route module (commit 288) reports server +
// database status, uptime, version, and memory usage; it returns 503
// when the database is unreachable so an upstream load balancer can
// drain the instance until it recovers.
app.use('/api/health', require('./routes/health.routes'));

// ==================== API Routes ====================
// Each route module attaches its own auth + role guards. Order here is
// alphabetical-by-path-prefix for readability; Express picks the right
// router based on the URL prefix regardless of registration order.
app.use('/api/attendances', require('./routes/attendance.routes'));
app.use('/api/audit-logs', require('./routes/auditLog.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/departments', require('./routes/department.routes'));
app.use('/api/documents', require('./routes/document.routes'));
app.use('/api/employees', require('./routes/employee.routes'));
app.use('/api/leave-requests', require('./routes/leaveRequest.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/performance-reviews', require('./routes/performanceReview.routes'));
app.use('/api/positions', require('./routes/position.routes'));
app.use('/api/salaries', require('./routes/salary.routes'));
app.use('/api/training-participants', require('./routes/trainingParticipant.routes'));
app.use('/api/trainings', require('./routes/training.routes'));
app.use('/api/users', require('./routes/user.routes'));

// ==================== 404 Handler ====================
// Anything reaching this point hit no route — return a structured JSON 404
// instead of Express's default HTML page.
app.use('/api', (req, res) => {
  // Standard error envelope (commit 273) — include statusCode + code
  // so the 404 looks identical to every other API error.
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    statusCode: 404,
    code: 'ERR_NOT_FOUND',
  });
});

// ==================== Error Handling ====================
// Body-parser size errors surface here as `entity.too.large` — the
// errorHandler catches them and emits a structured 413.
app.use(errorHandler);

module.exports = app;
