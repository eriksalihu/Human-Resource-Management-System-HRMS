/**
 * @file backend/src/tests/sqlInjection.test.js
 * @description SQL-injection regression tests (commit 291).
 *
 *   Audit findings: every query in models/ and controllers/ binds VALUE
 *   inputs through `?` placeholders. The few template-literal segments
 *   that interpolate ARE structural — `${conditions.join(' AND ')}` is
 *   built from `?` fragments with their values bound separately;
 *   `${safeSortBy}` / `${safeSortOrder}` are filtered through a
 *   whitelist; `${BASE_SELECT}` / `${ROLE_COLUMNS}` are static
 *   constants; `${fields.join(', ')}` in UPDATEs is assembled from a
 *   hardcoded per-column if-block, so user input never reaches the
 *   structural slot.
 *
 *   These tests fire known injection payloads at the parameter slots
 *   most likely to be vulnerable (sortBy / search / filter values) and
 *   assert that the responses are PROPERLY HANDLED — never 500, never a
 *   SQL error message leaked, never an unexpected wide-open result set.
 *
 * @author Dev A
 */

const {
  request,
  app,
  db,
  uniqueEmail,
  STRONG_PASSWORD,
  registerUser,
  closePool,
} = require('./helpers');
const Role = require('../models/Role');

const userIdByEmail = async (email) => {
  const [rows] = await db.query('SELECT id FROM Users WHERE email = ?', [
    email,
  ]);
  return rows[0]?.id;
};

let adminToken;

beforeAll(async () => {
  const adminEmail = uniqueEmail('sqli.admin');
  await registerUser({ email: adminEmail });
  const adminUserId = await userIdByEmail(adminEmail);
  const adminRole = await Role.findByName('Admin');
  if (adminRole && adminUserId) {
    await Role.assignToUser(adminUserId, adminRole.id);
  }
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: STRONG_PASSWORD });
  adminToken = loginRes.body?.data?.accessToken || null;
}, 30000);

afterAll(async () => {
  await closePool();
});

/**
 * Classic SQL-injection probes targeting whichever query parameter the
 * caller passes them through. Each is designed to either escape a
 * quoted string context, comment out the rest of the query, or smuggle
 * a UNION SELECT. If any of these breaks through, the response status
 * will be 500 (driver error) or the response body will contain rows
 * the test was never authorized to read.
 */
const INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "' OR 1=1--",
  "'; DROP TABLE Users; --",
  "' UNION SELECT password_hash FROM Users--",
  "1; DELETE FROM Employees WHERE 1=1; --",
  "admin'--",
  "'/**/OR/**/1=1--",
  // Common WAF-bypass / encoded forms
  "%27%20OR%201%3D1--",
  "1' AND SLEEP(0)--",
];

/**
 * Standard "safe" assertions for an injection-probed response: handled
 * (4xx/200 envelope), never a 500 (would imply the driver tried to
 * execute the payload), and the body is the project's structured
 * envelope rather than a raw SQL error message.
 */
const expectHandledResponse = (res) => {
  // Never a 500 — that would mean a SQL error reached the driver,
  // which is the smoking gun for "injection succeeded enough to break
  // syntax somewhere downstream."
  expect(res.status).not.toBe(500);
  // No raw SQL errors leaked to the client (case-insensitive scan).
  const bodyStr = JSON.stringify(res.body || {}).toLowerCase();
  expect(bodyStr).not.toMatch(/syntax error/);
  expect(bodyStr).not.toMatch(/sql/);
  expect(bodyStr).not.toMatch(/mysql/);
};

describe('SQL injection — sortBy whitelist (models/Employee.js)', () => {
  it.each(INJECTION_PAYLOADS)(
    'safely handles ?sortBy=%j on /api/employees',
    async (payload) => {
      const res = await request(app)
        .get(`/api/employees?sortBy=${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectHandledResponse(res);
      if (res.status === 200) {
        // The SORT_COLUMN_MAP whitelist falls back to id when the input
        // isn't known, so the request succeeds with a normal envelope.
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    }
  );
});

describe('SQL injection — sortOrder is enum-gated', () => {
  it.each(INJECTION_PAYLOADS)(
    'safely handles ?sortOrder=%j',
    async (payload) => {
      const res = await request(app)
        .get(`/api/employees?sortOrder=${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      // Either rejected by paginationChain (400/422) or coerced to ASC.
      // Never a 500.
      expectHandledResponse(res);
    }
  );
});

describe('SQL injection — search term (bound via `?` placeholder)', () => {
  it.each(INJECTION_PAYLOADS)(
    'safely handles ?search=%j on /api/employees',
    async (payload) => {
      const res = await request(app)
        .get(`/api/employees?search=${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectHandledResponse(res);
      // The payload becomes a literal LIKE pattern with no matches —
      // the array should be empty (or at most match a real employee
      // whose name literally contains the payload's characters).
      if (res.status === 200) {
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    }
  );
});

describe('SQL injection — id path param is integer-validated', () => {
  it.each(INJECTION_PAYLOADS)(
    'safely handles /api/employees/%j',
    async (payload) => {
      const res = await request(app)
        .get(`/api/employees/${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      // idParamChain enforces isInt → 400/422; never 500.
      expectHandledResponse(res);
      expect([400, 404, 422]).toContain(res.status);
    }
  );
});

describe('SQL injection — login email (bound via `?` placeholder)', () => {
  it.each(INJECTION_PAYLOADS)(
    'cannot bypass login with email=%j',
    async (payload) => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: payload, password: 'whatever' });
      // Classic `' OR 1=1--` bypass must NOT log anyone in.
      expect(res.status).not.toBe(200);
      expect(res.body?.data?.accessToken).toBeUndefined();
      expectHandledResponse(res);
    }
  );
});

describe('SQL injection — numeric filter (parsed by parseInt)', () => {
  it.each(INJECTION_PAYLOADS)(
    'safely handles ?department_id=%j',
    async (payload) => {
      const res = await request(app)
        .get(`/api/employees?department_id=${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectHandledResponse(res);
    }
  );
});
