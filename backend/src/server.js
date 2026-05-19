/**
 * @file backend/src/server.js
 * @description Server entry point — connects to database and starts Express
 * @author Dev A
 */

require('dotenv').config();
const app = require('./app');
const { testConnection, warmupPool } = require('./config/db');

const PORT = process.env.PORT || 5000;

/**
 * Start the server (commit 282 — startup perf).
 *
 * Previously `app.listen` was AWAITED behind the DB handshake, so
 * time-to-listening = DB connect latency. We now:
 *   1. Bind the port immediately — the server accepts connections as
 *      soon as the event loop is free.
 *   2. Verify connectivity + warm the pool concurrently, in the
 *      BACKGROUND, after we're already listening. The DB check is no
 *      longer on the critical path; if it fails the warning still
 *      surfaces and per-request error handling covers the rest.
 */
const startServer = () => {
  const server = app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  HRMS Server running on port ${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  API: http://localhost:${PORT}/api`);
    console.log(`========================================\n`);

    // Fire-and-forget: connectivity check then pool warmup. Off the
    // critical path so it never delays time-to-listening.
    testConnection()
      .then((ok) => {
        if (!ok) {
          console.error(
            'Database not reachable yet — server is up; requests will retry per-connection.'
          );
          return undefined;
        }
        return warmupPool();
      })
      .catch((err) =>
        console.error('Post-listen DB init error:', err.message)
      );
  });

  server.on('error', (error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
};

startServer();
