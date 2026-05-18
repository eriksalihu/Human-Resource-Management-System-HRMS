/**
 * @file backend/src/tests/helpers.js
 * @description Shared utilities for the supertest integration suites —
 *   unique-data factories, a login helper, and a pool-closer so Jest
 *   exits cleanly.
 * @author Dev A
 *
 * NOT a test file itself (jest.config ignores it). Imported by the
 * auth / employee / department suites.
 *
 * These are INTEGRATION helpers: they assume a reachable MySQL test
 * schema (set DB_NAME=hrms_test etc. before `npm test`). They never
 * touch prod — the suites only ever create rows they also clean up.
 */

const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

/**
 * Generate a collision-proof email per call so re-running the suite
 * doesn't trip the "email already registered" guard.
 *
 * @param {string} [prefix='user']
 * @returns {string}
 */
const uniqueEmail = (prefix = 'user') =>
  `${prefix}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2, 8)}@hrms-test.local`;

/**
 * A password that satisfies the documented strength contract
 * (>= 8 chars, upper + lower + number).
 */
const STRONG_PASSWORD = 'Test1234';

/**
 * Register a fresh user and return `{ email, password, user }`.
 *
 * @param {Object} [overrides] - Body overrides (e.g. custom email)
 * @returns {Promise<{ email: string, password: string, body: Object }>}
 */
const registerUser = async (overrides = {}) => {
  const email = overrides.email || uniqueEmail();
  const password = overrides.password || STRONG_PASSWORD;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password,
      first_name: overrides.first_name || 'Test',
      last_name: overrides.last_name || 'User',
      phone: overrides.phone,
    });
  return { email, password, res, body: res.body };
};

/**
 * Register (if needed) + log in, returning the access token plus the
 * raw login response so callers can assert on cookies.
 *
 * @param {Object} [overrides]
 * @returns {Promise<{ token: string|null, email: string, loginRes: Object }>}
 */
const loginUser = async (overrides = {}) => {
  const email = overrides.email || uniqueEmail();
  const password = overrides.password || STRONG_PASSWORD;

  if (!overrides.skipRegister) {
    await registerUser({ ...overrides, email, password });
  }

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  return {
    token: loginRes.body?.data?.accessToken || null,
    email,
    password,
    loginRes,
  };
};

/**
 * Close the mysql2 pool so Jest's event loop drains and the process
 * exits without `--forceExit` having to kill it.
 */
const closePool = async () => {
  try {
    await db.end();
  } catch {
    /* pool may already be closed — ignore */
  }
};

module.exports = {
  request,
  app,
  db,
  uniqueEmail,
  STRONG_PASSWORD,
  registerUser,
  loginUser,
  closePool,
};
