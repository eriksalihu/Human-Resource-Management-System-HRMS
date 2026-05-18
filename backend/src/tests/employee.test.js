/**
 * @file backend/src/tests/employee.test.js
 * @description Integration tests for the employee CRUD endpoints:
 *   create / read / update / delete, search, department & status
 *   filters, pagination, and role-based authorization.
 * @author Dev A
 *
 * Run against a disposable schema: `DB_NAME=hrms_test npm test`.
 *
 * Setup chain: employees can't exist without a department, a position,
 * and a backing user — so `beforeAll` builds that dependency graph once
 * (as an Admin) and the CRUD specs operate on it. An Admin token is
 * minted by registering a user then assigning the Admin role directly
 * in the DB (the role isn't grantable over the API by design).
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

/** Resolve a user's numeric id from their email (register returns the
 *  user object but we read from the DB to stay decoupled from its shape). */
const userIdByEmail = async (email) => {
  const [rows] = await db.query('SELECT id FROM Users WHERE email = ?', [
    email,
  ]);
  return rows[0]?.id;
};

/** Register a user and promote them to Admin, returning a bearer token. */
const bootstrapAdmin = async () => {
  const email = uniqueEmail('emp.admin');
  await registerUser({ email });
  const userId = await userIdByEmail(email);

  const adminRole = await Role.findByName('Admin');
  if (adminRole && userId) {
    await Role.assignToUser(userId, adminRole.id);
  }

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: STRONG_PASSWORD });
  return { token: res.body?.data?.accessToken || null, userId, email };
};

let adminToken;
let plainToken;
let deptId;
let positionId;
let freeUserId;
let createdEmployeeId;

beforeAll(async () => {
  const admin = await bootstrapAdmin();
  adminToken = admin.token;

  // A non-privileged user for the authorization assertions.
  const plain = await loginUser({ email: uniqueEmail('emp.plain') });
  plainToken = plain.token;

  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  // Department → Position → free user: the employee dependency chain.
  const deptRes = await auth(
    request(app).post('/api/departments')
  ).send({
    emertimi: `QA Dept ${Date.now()}`,
    pershkrimi: 'Auto-created by employee.test.js',
    lokacioni: 'Prishtina',
  });
  deptId = deptRes.body?.data?.id ?? deptRes.body?.data?.department?.id;

  const posRes = await auth(request(app).post('/api/positions')).send({
    department_id: deptId,
    emertimi: `QA Engineer ${Date.now()}`,
    niveli: 'mid',
    paga_min: 800,
    paga_max: 1600,
  });
  positionId = posRes.body?.data?.id ?? posRes.body?.data?.position?.id;

  const freeEmail = uniqueEmail('emp.free');
  await registerUser({ email: freeEmail });
  freeUserId = await userIdByEmail(freeEmail);
}, 30000);

afterAll(async () => {
  await closePool();
});

describe('Authorization', () => {
  it('rejects an unauthenticated list request (401)', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
  });

  it('rejects a non-privileged user (403)', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });

  it('allows an Admin (200)', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/employees (list / pagination / search / filter)', () => {
  const auth = () => `Bearer ${adminToken}`;

  it('returns a paginated envelope', async () => {
    const res = await request(app)
      .get('/api/employees?page=1&limit=5')
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toEqual(
      expect.objectContaining({ page: expect.any(Number) })
    );
  });

  it('accepts a search term without erroring', async () => {
    const res = await request(app)
      .get('/api/employees?search=zzz-no-match-expected')
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('accepts a department filter', async () => {
    const res = await request(app)
      .get(`/api/employees?department_id=${deptId}`)
      .set('Authorization', auth());
    expect(res.status).toBe(200);
  });

  it('accepts a status filter', async () => {
    const res = await request(app)
      .get('/api/employees?statusi=active')
      .set('Authorization', auth());
    expect(res.status).toBe(200);
  });
});

describe('Employee CRUD', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('creates an employee (201)', async () => {
    const res = await auth(request(app).post('/api/employees')).send({
      user_id: freeUserId,
      department_id: deptId,
      position_id: positionId,
      data_punesimit: '2026-01-15',
      lloji_kontrates: 'full-time',
    });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    createdEmployeeId =
      res.body?.data?.id ?? res.body?.data?.employee?.id;
    expect(createdEmployeeId).toBeDefined();
  });

  it('rejects creation with missing required fields (400)', async () => {
    const res = await auth(request(app).post('/api/employees')).send({
      user_id: freeUserId,
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('reads the created employee by id (200)', async () => {
    const res = await request(app)
      .get(`/api/employees/${createdEmployeeId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({ id: createdEmployeeId })
    );
  });

  it('returns 404 for a non-existent employee', async () => {
    const res = await request(app)
      .get('/api/employees/99999999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('updates the employee (200)', async () => {
    const res = await auth(
      request(app).put(`/api/employees/${createdEmployeeId}`)
    ).send({ lloji_kontrates: 'part-time' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('deletes (terminates) the employee (200)', async () => {
    const res = await auth(
      request(app).delete(`/api/employees/${createdEmployeeId}`)
    );
    expect([200, 204]).toContain(res.status);
  });
});
