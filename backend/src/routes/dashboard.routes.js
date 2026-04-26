/**
 * @file backend/src/routes/dashboard.routes.js
 * @description Dashboard routes — overview headline counts, chart datasets, and recent-activity feed
 * @author Dev A
 *
 * All endpoints require authentication but are open to every authenticated
 * role. The controller itself decides whether to surface privileged data
 * (e.g. payroll totals) based on req.user.roles.
 */

const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/auth');

const router = express.Router();

// Every dashboard route requires authentication
router.use(authenticate);

/**
 * @route   GET /api/dashboard/overview
 * @desc    Headline counts (employees, departments, pending leaves, today's
 *          attendance) plus current-month payroll totals for HR / Admin
 * @access  Private (any authenticated user)
 */
router.get('/overview', dashboardController.getOverview);

/**
 * @route   GET /api/dashboard/charts
 * @desc    Chart-ready datasets — employees by department, attendance trend,
 *          leave distribution. Optional ?trend_days=14 &leave_days=90.
 * @access  Private (any authenticated user)
 */
router.get('/charts', dashboardController.getCharts);

/**
 * @route   GET /api/dashboard/recent-activities
 * @desc    Recent audit-log entries for the activity feed widget (?limit=10)
 * @access  Private (any authenticated user)
 */
router.get('/recent-activities', dashboardController.getRecentActivities);

module.exports = router;
