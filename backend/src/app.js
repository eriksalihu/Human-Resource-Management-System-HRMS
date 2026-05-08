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

// Drop the `X-Powered-By: Express` header explicitly. Helmet does this
// too, but having it before helmet kicks in covers any pre-helmet path.
app.disable('x-powered-by');

// ==================== Security Middleware ====================
// `securityHeaders()` is our project-wrapped Helmet (CSP, HSTS,
// frame-ancestors, etc.). Configured per-environment internally.
app.use(securityHeaders());
app.use(cors(corsOptions));

// ==================== Compression + Logging ====================
app.use(compression());
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

// ==================== Input Sanitization ====================
// Walks req.body / req.query / req.params, trimming whitespace,
// escaping HTML entities, and stripping `$`-prefixed operator keys.
// Routes that need to accept raw HTML (none today) can opt out via
// `sanitize({ skipFields: ['richText'] })` mounted on that router.
app.use(sanitize());

// ==================== Health Check ====================
// Mounted before the auth-protected routes so liveness probes don't need
// credentials. Each individual route module applies its own
// `authenticate` / `authorize` middleware as appropriate.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// ==================== Error Handling ====================
// Body-parser size errors surface here as `entity.too.large` — the
// errorHandler catches them and emits a structured 413.
app.use(errorHandler);

module.exports = app;
