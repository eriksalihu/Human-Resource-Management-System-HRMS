/**
 * @file backend/src/app.js
 * @description Express application setup with middleware stack and route mounting
 * @author Dev A
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const corsOptions = require('./config/cors');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ==================== Security Middleware ====================
app.use(helmet()); // Set security HTTP headers
app.use(cors(corsOptions)); // Enable CORS with configured options

// ==================== Logging ====================
app.use(morgan('dev')); // HTTP request logging

// ==================== Body Parsing ====================
app.use(express.json({ limit: '10mb' })); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(cookieParser()); // Parse cookies (for refresh tokens)
app.use(compression()); // Compress response bodies

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
app.use(errorHandler);

module.exports = app;
