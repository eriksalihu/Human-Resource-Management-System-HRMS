/**
 * @file backend/src/config/db.js
 * @description MySQL2 promise-based connection pool configuration
 * @author Dev A
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
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

module.exports = pool;
module.exports.testConnection = testConnection;
module.exports.warmupPool = warmupPool;
