/**
 * @file backend/jest.config.js
 * @description Jest configuration for the API integration test suite.
 * @author Dev A
 *
 * The suites are integration tests: they exercise the real Express app
 * (via supertest) against a MySQL database. Point them at a DISPOSABLE
 * test schema — never the dev/prod DB — by setting DB_NAME (and the
 * other DB_* vars) before running, e.g.:
 *
 *   DB_NAME=hrms_test npm test
 *
 * Notes:
 *   - `testEnvironment: 'node'` — no jsdom; this is a backend API.
 *   - `--runInBand` (in the npm script) so DB-touching suites don't
 *     race each other on shared tables.
 *   - `forceExit` + a generous `testTimeout` because the mysql2 pool
 *     can keep the event loop alive briefly after the last test.
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/tests/**/*.test.js'],
  // helpers.js is shared utilities, not a suite — don't treat it as one.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/tests/helpers.js'],
  testTimeout: 15000,
  clearMocks: true,
  verbose: true,
};
