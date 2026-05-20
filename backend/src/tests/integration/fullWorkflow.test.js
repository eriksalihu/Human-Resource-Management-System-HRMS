/**
 * @file backend/src/tests/integration/fullWorkflow.test.js
 * @description End-to-end HR workflow integration test (commit 286).
 *   Walks the complete employee lifecycle through the live API:
 *
 *     register → login (HR Admin) →
 *     create department → create position →
 *     register employee user → create employee →
 *     create salary record →
 *     submit leave request → approve leave →
 *     record attendance (check-in) →
 *     create performance review
 *
 *   Each step asserts a healthy status + envelope so a regression in
 *   ANY of those controllers fails the suite. Run against a disposable
 *   schema (`DB_NAME=hrms_test npm test`) — every record created here
 *   is uniquely named, so re-runs don't collide.
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
} = require('../helpers');
const Role = require('../../models/Role');

/** Pull a user's id by email — register doesn't pin a shape we depend on. */
const userIdByEmail = async (email) => {
  const [rows] = await db.query('SELECT id FROM Users WHERE email = ?', [
    email,
  ]);
  return rows[0]?.id;
};

let adminToken;
let employeeUserId;

// Captured IDs threaded through the workflow.
const ids = {
  departmentId: null,
  positionId: null,
  employeeId: null,
  salaryId: null,
  leaveRequestId: null,
  attendanceId: null,
  reviewId: null,
};

beforeAll(async () => {
  // ── Step 1: Register the HR Admin user that drives the workflow ───
  const adminEmail = uniqueEmail('wf.admin');
  await registerUser({ email: adminEmail });
  const adminUserId = await userIdByEmail(adminEmail);
  const adminRole = await Role.findByName('Admin');
  if (adminRole && adminUserId) {
    await Role.assignToUser(adminUserId, adminRole.id);
  }

  // ── Step 2: Login as Admin ────────────────────────────────────────
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: STRONG_PASSWORD });
  adminToken = loginRes.body?.data?.accessToken || null;

  // Register a user that will be promoted to an Employee record later.
  const empEmail = uniqueEmail('wf.emp');
  await registerUser({ email: empEmail });
  employeeUserId = await userIdByEmail(empEmail);
}, 45000);

afterAll(async () => {
  await closePool();
});

/** Auth helper for every request below. */
const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

describe('Full HR workflow', () => {
  it('Step 1 — registers and logs in the HR Admin', () => {
    expect(adminToken).toEqual(expect.any(String));
    expect(employeeUserId).toEqual(expect.any(Number));
  });

  it('Step 2 — creates a department', async () => {
    const res = await auth(request(app).post('/api/departments')).send({
      emertimi: `Workflow Dept ${Date.now()}`,
      pershkrimi: 'Created by fullWorkflow.test.js',
      lokacioni: 'Prishtina',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    ids.departmentId =
      res.body?.data?.id ?? res.body?.data?.department?.id;
    expect(ids.departmentId).toBeDefined();
  });

  it('Step 3 — creates a position in that department', async () => {
    const res = await auth(request(app).post('/api/positions')).send({
      department_id: ids.departmentId,
      emertimi: `Workflow Role ${Date.now()}`,
      niveli: 'mid',
      paga_min: 900,
      paga_max: 1800,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    ids.positionId = res.body?.data?.id ?? res.body?.data?.position?.id;
    expect(ids.positionId).toBeDefined();
  });

  it('Step 4 — creates an employee record', async () => {
    const res = await auth(request(app).post('/api/employees')).send({
      user_id: employeeUserId,
      department_id: ids.departmentId,
      position_id: ids.positionId,
      data_punesimit: '2026-02-15',
      lloji_kontrates: 'full-time',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    ids.employeeId =
      res.body?.data?.id ?? res.body?.data?.employee?.id;
    expect(ids.employeeId).toBeDefined();
  });

  it('Step 5 — creates a salary record (auto-computes net)', async () => {
    const res = await auth(request(app).post('/api/salaries')).send({
      employee_id: ids.employeeId,
      paga_baze: 1200,
      bonuse: 150,
      zbritje: 25,
      muaji: 3,
      viti: 2099,
      // paga_neto intentionally omitted so the controller computes it.
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    const sal = res.body?.data?.salary ?? res.body?.data;
    ids.salaryId = sal?.id;
    expect(ids.salaryId).toBeDefined();
    expect(Number(sal.paga_neto)).toBeGreaterThan(0);
  });

  it('Step 6 — submits a leave request on behalf of the employee', async () => {
    const res = await auth(request(app).post('/api/leave-requests')).send({
      employee_id: ids.employeeId,
      lloji: 'annual',
      data_fillimit: '2099-04-10',
      data_perfundimit: '2099-04-14',
      arsyeja: 'Spring break — workflow test',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    ids.leaveRequestId =
      res.body?.data?.id ?? res.body?.data?.leaveRequest?.id;
    expect(ids.leaveRequestId).toBeDefined();
  });

  it('Step 7 — approves the leave request', async () => {
    const res = await auth(
      request(app).put(`/api/leave-requests/${ids.leaveRequestId}/approve`)
    ).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Step 8 — records an attendance entry', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await auth(request(app).post('/api/attendances')).send({
      employee_id: ids.employeeId,
      data: today,
      ora_hyrjes: '09:00:00',
      ora_daljes: '17:00:00',
      statusi: 'present',
      shenimet: 'Workflow attendance entry',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    const att = res.body?.data?.attendance ?? res.body?.data;
    ids.attendanceId = att?.id;
    expect(ids.attendanceId).toBeDefined();
  });

  it('Step 9 — creates a performance review for the employee', async () => {
    const res = await auth(
      request(app).post('/api/performance-reviews')
    ).send({
      employee_id: ids.employeeId,
      periudha: '2099-Q1',
      nota: 4.5,
      pikat_forta: 'Reliable, communicative, ships on time',
      data_vleresimit: '2099-03-31',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    ids.reviewId = res.body?.data?.id ?? res.body?.data?.review?.id;
    expect(ids.reviewId).toBeDefined();
  });

  it('Step 10 — closes the loop: every captured id is set', () => {
    // A single snapshot assertion so a future contributor can see at a
    // glance which artefacts the workflow produced.
    expect(ids).toEqual(
      expect.objectContaining({
        departmentId: expect.any(Number),
        positionId: expect.any(Number),
        employeeId: expect.any(Number),
        salaryId: expect.any(Number),
        leaveRequestId: expect.any(Number),
        attendanceId: expect.any(Number),
        reviewId: expect.any(Number),
      })
    );
  });
});
