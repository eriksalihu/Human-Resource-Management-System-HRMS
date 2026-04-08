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

// ==================== API Routes ====================
// Route mounting placeholders — will be added as modules are built
// app.use('/api/auth', require('./routes/auth.routes'));
// app.use('/api/users', require('./routes/user.routes'));
// app.use('/api/roles', require('./routes/role.routes'));
// app.use('/api/departments', require('./routes/department.routes'));
// app.use('/api/positions', require('./routes/position.routes'));
// app.use('/api/employees', require('./routes/employee.routes'));
// app.use('/api/salaries', require('./routes/salary.routes'));
// app.use('/api/leave-requests', require('./routes/leaveRequest.routes'));
// app.use('/api/attendances', require('./routes/attendance.routes'));
// app.use('/api/performance-reviews', require('./routes/performanceReview.routes'));
// app.use('/api/trainings', require('./routes/training.routes'));
// app.use('/api/documents', require('./routes/document.routes'));
// app.use('/api/audit-logs', require('./routes/auditLog.routes'));
// app.use('/api/notifications', require('./routes/notification.routes'));
// app.use('/api/dashboard', require('./routes/dashboard.routes'));

// ==================== Health Check ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== Error Handling ====================
app.use(errorHandler);

module.exports = app;
