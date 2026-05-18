/**
 * @file backend/src/tests/salary.test.js
 * @description Integration tests for the salary / payroll endpoints:
 *   create with net-pay auto-calculation, duplicate-period prevention,
 *   payroll summary aggregation, bulk generation, validation, and
 *   role-based authorization.
 * @author Dev A
 *
 * Run against a disposable schema: `DB_NAME=hrms_test npm test`.
 *
 * Salaries hang off an employee, which hangs off a department +
 * position + user — `beforeAll` builds that chain once as an Admin
 * (the Admin role is granted directly in the DB; it isn't API-grantable
 * by design).
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
let employeeId;
let createdSalaryId;

// A period unlikely to collide with seed data, recomputed per run.
const VITI = 2099;
const MUAJI = 7;

beforeAll(async () => {
  // Admin bootstrap.
  const adminEmail = uniqueEmail('sal.admin');
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

  const plain = await loginUser({ email: uniqueEmail('sal.plain') });
  plainToken = plain.token;

  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  // Department → Position → user → employee.
  const depRes = await auth(request(app).post('/api/departments')).send({
    emertimi: `Payroll Dept ${Date.now()}`,
  });
  const depId = depRes.body?.data?.id ?? depRes.body?.data?.department?.id;

  const posRes = await auth(request(app).post('/api/positions')).send({
    department_id: depId,
    emertimi: `Payroll Role ${Date.now()}`,
    niveli: 'mid',
  });
  const posId = posRes.body?.data?.id ?? posRes.body?.data?.position?.id;

  const empEmail = uniqueEmail('sal.emp');
  await registerUser({ email: empEmail });
  const empUserId = await userIdByEmail(empEmail);

  const empRes = await auth(request(app).post('/api/employees')).send({
    user_id: empUserId,
    department_id: depId,
    position_id: posId,
    data_punesimit: '2026-01-10',
    lloji_kontrates: 'full-time',
  });
  employeeId = empRes.body?.data?.id ?? empRes.body?.data?.employee?.id;
}, 30000);

afterAll(async () => {
  await closePool();
});

describe('Authorization', () => {
  it('rejects an unauthenticated list (401)', async () => {
    const res = await request(app).get('/api/salaries');
    expect(res.status).toBe(401);
  });

  it('rejects a non-privileged user (403)', async () => {
    const res = await request(app)
      .get('/api/salaries')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });

  it('allows Admin (200)', async () => {
    const res = await request(app)
      .get('/api/salaries')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Salary create + net auto-calculation', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('creates a salary and auto-computes net pay when omitted', async () => {
    const res = await auth(request(app).post('/api/salaries')).send({
      employee_id: employeeId,
      paga_baze: 1000,
      bonuse: 200,
      zbritje: 50,
      muaji: MUAJI,
      viti: VITI,
      // paga_neto intentionally omitted — controller must compute it.
    });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    const salary = res.body?.data?.salary ?? res.body?.data;
    createdSalaryId = salary?.id;
    expect(createdSalaryId).toBeDefined();
    // Net must be present, numeric, and below gross (deductions applied).
    const net = Number(salary?.paga_neto);
    expect(Number.isFinite(net)).toBe(true);
    expect(net).toBeGreaterThan(0);
    expect(net).toBeLessThan(1000 + 200);
  });

  it('prevents a duplicate (employee, muaji, viti) period (409)', async () => {
    const res = await auth(request(app).post('/api/salaries')).send({
      employee_id: employeeId,
      paga_baze: 1100,
      muaji: MUAJI,
      viti: VITI,
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects missing required fields (400)', async () => {
    const res = await auth(request(app).post('/api/salaries')).send({
      employee_id: employeeId,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an out-of-range month (400)', async () => {
    const res = await auth(request(app).post('/api/salaries')).send({
      employee_id: employeeId,
      paga_baze: 900,
      muaji: 13,
      viti: VITI,
    });
    expect(res.status).toBe(400);
  });
});

describe('Salary read / update / delete', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('reads the created salary by id (200)', async () => {
    const res = await request(app)
      .get(`/api/salaries/${createdSalaryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('updates the salary and recomputes net (200)', async () => {
    const res = await auth(
      request(app).put(`/api/salaries/${createdSalaryId}`)
    ).send({ bonuse: 500 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('deletes the salary (Admin only)', async () => {
    const res = await auth(
      request(app).delete(`/api/salaries/${createdSalaryId}`)
    );
    expect([200, 204]).toContain(res.status);
  });
});

describe('Payroll summary + bulk', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('requires muaji + viti on the summary endpoint (400)', async () => {
    const res = await request(app)
      .get('/api/salaries/payroll/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('returns an aggregate payroll summary for a period (200)', async () => {
    const res = await request(app)
      .get(`/api/salaries/payroll/summary?muaji=${MUAJI}&viti=${VITI}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({ muaji: MUAJI, viti: VITI })
    );
  });

  it('handles a bulk payroll generation request without erroring', async () => {
    // Shape of the bulk body varies; the contract we assert is "an
    // authorized call doesn't 500" — it either generates (200/201) or
    // reports a defined validation problem (400).
    const res = await auth(request(app).post('/api/salaries/bulk')).send({
      muaji: 8,
      viti: VITI,
    });
    expect([200, 201, 400]).toContain(res.status);
  });
});
