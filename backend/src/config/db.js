/**
 * @file backend/src/config/db.js
 * @description MySQL2 promise-based connection pool configuration
 * @author Dev A
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'hrms_db',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * Test the database connection pool health
 * @returns {Promise<boolean>} True if connection is successful
 */
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✓ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return false;
  }
};

/**
 * Warm up the connection pool (commit 282 — startup perf).
 *
 * mysql2 pools open connections lazily on first use, so without this
 * the FIRST few real requests each eat a full TCP + MySQL auth
 * handshake (tens to hundreds of ms). Pre-opening a handful of
 * connections in parallel — in the background, AFTER the server is
 * already listening — moves that cost off the user's first request
 * without delaying time-to-listening.
 *
 * Best-effort: a failure here only means the cold-start penalty isn't
 * pre-paid; it never crashes the server (the per-request path retries).
 *
 * @param {number} [count=3] - Connections to pre-open (capped at the
 *   pool's connectionLimit by mysql2 anyway).
 * @returns {Promise<void>}
 */
const warmupPool = async (count = 3) => {
  try {
    const conns = await Promise.all(
      Array.from({ length: count }, () => pool.getConnection())
    );
    conns.forEach((c) => c.release());
    console.log(`✓ DB pool warmed (${conns.length} connections)`);
  } catch (error) {
    console.warn('⚠ DB pool warmup skipped:', error.message);
  }
};

/* ──────────────────────────────────────────────────────────────────── */
/* Connection resilience (commit 287)                                   */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * mysql2 / driver-level error codes that indicate a connection-layer
 * problem (vs. a query / data problem). These are safe to RETRY because
 * the issue is transport, not logic.
 *
 * Anything else (ER_DUP_ENTRY, ER_NO_REFERENCED_ROW_2, etc.) is a
 * user/data error and must NOT be retried — that would just amplify the
 * cost of a known-failing operation.
 */
const RETRIABLE_DB_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR', // pool exhausted on the server side
]);

/**
 * Public list — also consumed by `middleware/errorHandler` to map any
 * DB-connection failure that escapes to a 503 instead of a generic 500.
 */
const DB_UNAVAILABLE_CODES = Array.from(RETRIABLE_DB_CODES);

/** Sleep `ms` milliseconds. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decide whether an error is worth retrying.
 * @param {Error} err
 */
const isRetriable = (err) =>
  Boolean(err) &&
  (RETRIABLE_DB_CODES.has(err.code) || RETRIABLE_DB_CODES.has(err.errno));

/**
 * Lightweight liveness probe used by the health endpoint and by start-up
 * warmup. `SELECT 1` keeps the round-trip minimal.
 *
 * @returns {Promise<boolean>} True when the pool can serve a connection
 */
const pingDatabase = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {
        /* released already / pool churn */
      }
    }
  }
};

/**
 * Acquire a connection with exponential backoff on transient failures.
 *
 * Real database outages (a crashed server, a network blip during a
 * deploy, a transient pool exhaustion under load) typically recover in
 * a few hundred milliseconds. Retrying with backoff turns those into
 * sub-second hiccups instead of user-visible 500s, while still failing
 * fast on permanent errors (bad credentials, wrong host, etc. → not in
 * `RETRIABLE_DB_CODES`).
 *
 * @param {Object} [opts]
 * @param {number} [opts.attempts=4]   Max attempts including the first
 * @param {number} [opts.baseMs=120]   Initial delay; doubles each attempt
 * @param {number} [opts.maxMs=2000]   Cap on per-attempt delay
 * @returns {Promise<import('mysql2/promise').PoolConnection>}
 */
const getConnectionWithRetry = async ({
  attempts = 4,
  baseMs = 120,
  maxMs = 2000,
} = {}) => {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await pool.getConnection();
    } catch (err) {
      lastErr = err;
      if (!isRetriable(err) || attempt === attempts) break;
      // Exponential backoff with jitter (±25%) so a thundering herd of
      // simultaneous reconnects spreads out instead of stampeding.
      const target = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const jitter = target * (0.75 + Math.random() * 0.5);
      // eslint-disable-next-line no-await-in-loop
      await wait(jitter);
    }
  }
  throw lastErr;
};

/**
 * Run a parameterised query through the retry helper. Mirrors the
 * mysql2 pool's `.query(sql, params)` signature so callers can swap to
 * `queryWithRetry` without changing semantics.
 *
 * Only the CONNECTION acquisition is retried — once we're holding a
 * connection, a query-level error (syntax, FK, etc.) is a real bug
 * surfacing the first time, not something to mask with retries.
 *
 * @param {string} sql
 * @param {Array<*>} [params]
 * @param {Object} [opts] - Forwarded to `getConnectionWithRetry`
 */
const queryWithRetry = async (sql, params, opts) => {
  const conn = await getConnectionWithRetry(opts);
  try {
    return await conn.query(sql, params);
  } finally {
    try {
      conn.release();
    } catch {
      /* released already */
    }
  }
};

module.exports = pool;
module.exports.testConnection = testConnection;
module.exports.warmupPool = warmupPool;
module.exports.pingDatabase = pingDatabase;
module.exports.getConnectionWithRetry = getConnectionWithRetry;
module.exports.queryWithRetry = queryWithRetry;
module.exports.DB_UNAVAILABLE_CODES = DB_UNAVAILABLE_CODES;
