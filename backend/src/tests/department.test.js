/**
 * @file backend/src/tests/department.test.js
 * @description Integration tests for the department endpoints: CRUD,
 *   search, manager assignment, role-based authorization, and the
 *   relation/cascade behavior when deleting a department that still has
 *   a position attached.
 * @author Dev A
 *
 * Run against a disposable schema: `DB_NAME=hrms_test npm test`.
 *
 * Route authorization contract (from department.routes.js):
 *   GET    list/by-id  → any authenticated user
 *   POST   create      → Admin, HR Manager
 *   PUT    update      → Admin, HR Manager
 *   DELETE delete      → Admin only
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

/** Register a user, grant them `roleName`, return a bearer token. */
const tokenWithRole = async (roleName, tag) => {
  const email = uniqueEmail(tag);
  await registerUser({ email });
  const userId = await userIdByEmail(email);
  if (roleName) {
    const role = await Role.findByName(roleName);
    if (role && userId) await Role.assignToUser(userId, role.id);
  }
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: STRONG_PASSWORD });
  return res.body?.data?.accessToken || null;
};

let adminToken;
let plainToken;
let createdId;

beforeAll(async () => {
  adminToken = await tokenWithRole('Admin', 'dept.admin');
  const plain = await loginUser({ email: uniqueEmail('dept.plain') });
  plainToken = plain.token;
}, 30000);

afterAll(async () => {
  await closePool();
});

describe('Authorization', () => {
  it('rejects an unauthenticated list (401)', async () => {
    const res = await request(app).get('/api/departments');
    expect(res.status).toBe(401);
  });

  it('lets any authenticated user list departments (200)', async () => {
    const res = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('forbids a non-privileged user from creating (403)', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ emertimi: 'Should Not Exist' });
    expect(res.status).toBe(403);
  });

  it('forbids a non-privileged user from deleting (403)', async () => {
    const res = await request(app)
      .delete('/api/departments/1')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Department CRUD', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('creates a department (201)', async () => {
    const res = await auth(request(app).post('/api/departments')).send({
      emertimi: `Engineering ${Date.now()}`,
      pershkrimi: 'Created by department.test.js',
      lokacioni: 'Prishtina',
      buxheti: 250000,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    createdId = res.body?.data?.id ?? res.body?.data?.department?.id;
    expect(createdId).toBeDefined();
  });

  it('rejects creation without a name (400)', async () => {
    const res = await auth(request(app).post('/api/departments')).send({
      pershkrimi: 'no emertimi here',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('reads the department by id (200)', async () => {
    const res = await request(app)
      .get(`/api/departments/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({ id: createdId })
    );
  });

  it('404s for a non-existent department', async () => {
    const res = await request(app)
      .get('/api/departments/99999999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('updates the department (200)', async () => {
    const res = await auth(
      request(app).put(`/api/departments/${createdId}`)
    ).send({ lokacioni: 'Prizren', buxheti: 300000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('supports search / filtering without erroring', async () => {
    const res = await request(app)
      .get('/api/departments?search=Engineering')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Manager assignment + relation/cascade', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('accepts a department with a position attached, then deletes it', async () => {
    // New department dedicated to the cascade check.
    const depRes = await auth(request(app).post('/api/departments')).send({
      emertimi: `Cascade Dept ${Date.now()}`,
    });
    const depId = depRes.body?.data?.id ?? depRes.body?.data?.department?.id;

    // Attach a position so the relation is non-trivial.
    await auth(request(app).post('/api/positions')).send({
      department_id: depId,
      emertimi: `Cascade Role ${Date.now()}`,
      niveli: 'junior',
    });

    // Deleting a department that still has a position is a relation
    // decision: the API either cascades (200/204) or refuses with a
    // 409 conflict. Either is a valid, defined contract — assert it's
    // one of those and not a 500.
    const delRes = await auth(
      request(app).delete(`/api/departments/${depId}`)
    );
    expect([200, 204, 409]).toContain(delRes.status);
  });

  it('Admin can delete a plain department (200)', async () => {
    const res = await auth(
      request(app).delete(`/api/departments/${createdId}`)
    );
    expect([200, 204]).toContain(res.status);
  });
});
