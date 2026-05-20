/**
 * @file backend/src/routes/health.routes.js
 * @description Health check endpoint for monitoring + liveness probes.
 *   Reports server status, database connectivity, uptime, version, and
 *   memory usage.
 * @author Dev A
 *
 * No authentication: an uptime monitor / load balancer needs to probe
 * this WITHOUT credentials. Nothing sensitive is exposed — version is
 * already-public package metadata, memory numbers are coarse-grained
 * RSS / heap figures.
 *
 * Status semantics (consumed by external monitors):
 *   - 200 + status='ok'       → server up AND database reachable
 *   - 503 + status='degraded' → server up but database unreachable
 *
 * Returning 503 (not 200) when the DB is down lets a load balancer mark
 * the instance unhealthy and stop sending it traffic until recovery.
 */

const express = require('express');
const { pingDatabase } = require('../config/db');

const router = express.Router();

/** App version read once at module load (package.json doesn't change). */
const VERSION = (() => {
  try {
    // eslint-disable-next-line global-require
    return require('../../package.json').version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

/**
 * Format process memory usage as MB (1 decimal). RSS = total resident
 * set size; heapUsed = actually-allocated JS heap. Both are useful for
 * spotting leaks over time without leaking arbitrary process internals.
 */
const memoryMB = () => {
  const m = process.memoryUsage();
  const toMB = (b) => +(b / 1024 / 1024).toFixed(1);
  return {
    rss_mb: toMB(m.rss),
    heap_used_mb: toMB(m.heapUsed),
    heap_total_mb: toMB(m.heapTotal),
  };
};

/**
 * @route   GET /api/health
 * @desc    Liveness + readiness probe
 * @access  Public
 */
router.get('/', async (req, res) => {
  const dbUp = await pingDatabase();
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    database: dbUp ? 'connected' : 'disconnected',
    uptime_seconds: Math.floor(process.uptime()),
    version: VERSION,
    memory: memoryMB(),
    node: process.version,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
