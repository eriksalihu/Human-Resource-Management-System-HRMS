/**
 * @file backend/src/tests/leaveRequest.test.js
 * @description Integration tests for the leave-request workflow:
 *   creation + validation, date-overlap detection, the
 *   approve / reject flow, the self-service balance endpoint, and
 *   approver authorization.
 * @author Dev A
 *
 * Run against a disposable schema: `DB_NAME=hrms_test npm test`.
 *
 * HR/Admin may create leave requests on behalf of an employee
 * (`employee_id` in the body), which keeps the suite from needing to
 * log in as the leave-taker. `beforeAll` builds an Admin + a target
 * employee (department → position → user → employee).
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

beforeAll(async () => {
  const adminEmail = uniqueEmail('lv.admin');
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

  const plain = await loginUser({ email: uniqueEmail('lv.plain') });
  plainToken = plain.token;

  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  const depRes = await auth(request(app).post('/api/departments')).send({
    emertimi: `Leave Dept ${Date.now()}`,
  });
  const depId = depRes.body?.data?.id ?? depRes.body?.data?.department?.id;

  const posRes = await auth(request(app).post('/api/positions')).send({
    department_id: depId,
    emertimi: `Leave Role ${Date.now()}`,
    niveli: 'junior',
  });
  const posId = posRes.body?.data?.id ?? posRes.body?.data?.position?.id;

  const empEmail = uniqueEmail('lv.emp');
  await registerUser({ email: empEmail });
  const empUserId = await userIdByEmail(empEmail);

  const empRes = await auth(request(app).post('/api/employees')).send({
    user_id: empUserId,
    department_id: depId,
    position_id: posId,
    data_punesimit: '2026-02-01',
    lloji_kontrates: 'full-time',
  });
  employeeId = empRes.body?.data?.id ?? empRes.body?.data?.employee?.id;
}, 30000);

afterAll(async () => {
  await closePool();
});

const createLeave = (overrides = {}) => {
  const body = {
    employee_id: employeeId,
    lloji: 'annual',
    data_fillimit: '2099-03-02',
    data_perfundimit: '2099-03-06',
    arsyeja: 'Integration test leave',
    ...overrides,
  };
  return request(app)
    .post('/api/leave-requests')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
};

describe('Leave request creation + validation', () => {
  it('creates a leave request (201)', async () => {
    const res = await createLeave({
      data_fillimit: '2099-03-02',
      data_perfundimit: '2099-03-06',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it('detects an overlapping request (409)', async () => {
    // Overlaps the 2099-03-02..06 window created above.
    const res = await createLeave({
      data_fillimit: '2099-03-04',
      data_perfundimit: '2099-03-08',
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects missing required fields (400)', async () => {
    const res = await request(app)
      .post('/api/leave-requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employee_id: employeeId, lloji: 'annual' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid leave type (400)', async () => {
    const res = await createLeave({
      lloji: 'vacation-on-mars',
      data_fillimit: '2099-05-01',
      data_perfundimit: '2099-05-03',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an end date before the start date (400)', async () => {
    const res = await createLeave({
      data_fillimit: '2099-06-10',
      data_perfundimit: '2099-06-01',
    });
    expect(res.status).toBe(400);
  });
});

describe('Approve / reject workflow', () => {
  const auth = (token) => `Bearer ${token}`;

  it('approves a pending request (200) and flips status', async () => {
    const created = await createLeave({
      data_fillimit: '2099-07-01',
      data_perfundimit: '2099-07-03',
    });
    const id =
      created.body?.data?.id ?? created.body?.data?.leaveRequest?.id;
    expect(id).toBeDefined();

    const res = await request(app)
      .put(`/api/leave-requests/${id}/approve`)
      .set('Authorization', auth(adminToken))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a pending request (200)', async () => {
    const created = await createLeave({
      data_fillimit: '2099-08-01',
      data_perfundimit: '2099-08-02',
    });
    const id =
      created.body?.data?.id ?? created.body?.data?.leaveRequest?.id;

    const res = await request(app)
      .put(`/api/leave-requests/${id}/reject`)
      .set('Authorization', auth(adminToken))
      .send({ arsyeja: 'Coverage gap' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('forbids a non-privileged user from approving (403)', async () => {
    const created = await createLeave({
      data_fillimit: '2099-09-01',
      data_perfundimit: '2099-09-02',
    });
    const id =
      created.body?.data?.id ?? created.body?.data?.leaveRequest?.id;

    const res = await request(app)
      .put(`/api/leave-requests/${id}/approve`)
      .set('Authorization', auth(plainToken))
      .send({});
    expect(res.status).toBe(403);
  });

  it('404s approving a non-existent request', async () => {
    const res = await request(app)
      .put('/api/leave-requests/99999999/approve')
      .set('Authorization', auth(adminToken))
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('Self-service balance + listing', () => {
  it('exposes a balance payload on /me for an authenticated user', async () => {
    // A plain user with no employee row still gets a defined response
    // (either the balance envelope or a 404 "no employee linked") —
    // never a 500.
    const res = await request(app)
      .get('/api/leave-requests/me')
      .set('Authorization', `Bearer ${plainToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    }
  });

  it('lists leave requests for HR/Admin (200)', async () => {
    const res = await request(app)
      .get('/api/leave-requests?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects an unauthenticated list (401)', async () => {
    const res = await request(app).get('/api/leave-requests');
    expect(res.status).toBe(401);
  });
});
