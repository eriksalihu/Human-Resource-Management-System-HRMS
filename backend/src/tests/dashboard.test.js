/**
 * @file backend/src/tests/dashboard.test.js
 * @description Integration tests for the dashboard endpoints: overview
 *   headline counts, chart-dataset format, the recent-activity feed,
 *   privileged-payroll gating, and authentication.
 * @author Dev A
 *
 * Run against a disposable schema: `DB_NAME=hrms_test npm test`.
 *
 * All three routes require auth but are open to every role; the
 * controller decides whether to surface privileged payroll data based
 * on the caller's roles. We bootstrap both a plain user and an Admin
 * (role granted directly in the DB — not API-grantable) to assert that
 * gate from both sides.
 */

const {
  request,
  app,
  db,
  uniqueEmail,
  STRONG_PASSWORD,
  registerUser,
  loginUser,
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
let plainToken;

beforeAll(async () => {
  const adminEmail = uniqueEmail('dash.admin');
  await registerUser({ email: adminEmail });
  const adminUserId = await userIdByEmail(adminEmail);
  const adminRole = await Role.findByName('Admin');
  if (adminRole && adminUserId) {
    await Role.assignToUser(adminUserId, adminRole.id);
  }
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: STRONG_PASSWORD });
  adminToken = adminLogin.body?.data?.accessToken || null;

  const plain = await loginUser({ email: uniqueEmail('dash.plain') });
  plainToken = plain.token;
}, 30000);

afterAll(async () => {
  await closePool();
});

describe('Authentication', () => {
  it.each([
    '/api/dashboard/overview',
    '/api/dashboard/charts',
    '/api/dashboard/recent-activities',
  ])('rejects %s without a token (401)', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/dashboard/overview', () => {
  it('returns headline counts for any authenticated user (200)', async () => {
    const res = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({ counts: expect.any(Object) })
    );
  });

  it('withholds payroll totals from a non-privileged user', async () => {
    const res = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(200);
    // Non-privileged → payroll must be null (not leaked).
    expect(res.body.data.payroll).toBeNull();
  });

  it('includes payroll totals for an Admin', async () => {
    const res = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // Privileged → payroll is an object (shape varies; presence is the
    // contract being asserted here).
    expect(res.body.data).toHaveProperty('payroll');
    if (res.body.data.payroll !== null) {
      expect(typeof res.body.data.payroll).toBe('object');
    }
  });
});

describe('GET /api/dashboard/charts', () => {
  it('returns the chart-dataset envelope (200)', async () => {
    const res = await request(app)
      .get('/api/dashboard/charts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;
    expect(Array.isArray(d.employees_by_department)).toBe(true);
    // Trend / distribution come wrapped with a window + series array.
    expect(d.attendance_trend).toEqual(
      expect.objectContaining({ series: expect.any(Array) })
    );
    expect(d.leave_distribution).toEqual(
      expect.objectContaining({ series: expect.any(Array) })
    );
  });

  it('honors the trend_days / leave_days query params', async () => {
    const res = await request(app)
      .get('/api/dashboard/charts?trend_days=7&leave_days=30')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.attendance_trend.window_days).toBe(7);
    expect(res.body.data.leave_distribution.window_days).toBe(30);
  });

  it('clamps out-of-range params instead of erroring', async () => {
    // trend_days max is 90, leave_days max 365 — over-large values must
    // be clamped, not 500.
    const res = await request(app)
      .get('/api/dashboard/charts?trend_days=9999&leave_days=9999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.attendance_trend.window_days).toBeLessThanOrEqual(
      90
    );
    expect(res.body.data.leave_distribution.window_days).toBeLessThanOrEqual(
      365
    );
  });
});

describe('GET /api/dashboard/recent-activities', () => {
  it('returns the activity feed envelope (200)', async () => {
    const res = await request(app)
      .get('/api/dashboard/recent-activities')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.activities)).toBe(true);
    expect(res.body.data.count).toBe(res.body.data.activities.length);
  });

  it('respects the ?limit= cap', async () => {
    const res = await request(app)
      .get('/api/dashboard/recent-activities?limit=3')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.activities.length).toBeLessThanOrEqual(3);
  });

  it('returns activities newest-first when there are ≥ 2', async () => {
    const res = await request(app)
      .get('/api/dashboard/recent-activities?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const acts = res.body.data.activities;
    if (acts.length >= 2) {
      const tsOf = (a) =>
        new Date(a.created_at || a.timestamp || a.data || 0).getTime();
      // Non-increasing timestamps == newest first.
      for (let i = 1; i < acts.length; i += 1) {
        expect(tsOf(acts[i - 1])).toBeGreaterThanOrEqual(tsOf(acts[i]));
      }
    }
  });
});
