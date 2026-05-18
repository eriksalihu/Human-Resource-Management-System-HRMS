/**
 * @file backend/src/tests/auth.test.js
 * @description Integration tests for the authentication endpoints:
 *   registration, login, token refresh (with rotation), logout, and
 *   account-lockout behavior.
 * @author Dev A
 *
 * Run against a disposable schema: `DB_NAME=hrms_test npm test`.
 *
 * Each test creates its own user with a unique email (see helpers) so
 * the suite is order-independent and re-runnable without manual
 * cleanup. The assertions encode the INTENDED auth contract — a
 * failure here is a real regression to investigate, not a flaky test.
 */

const {
  request,
  app,
  uniqueEmail,
  STRONG_PASSWORD,
  registerUser,
  loginUser,
  closePool,
} = require('./helpers');

afterAll(async () => {
  await closePool();
});

describe('POST /api/auth/register', () => {
  it('registers a new user with valid input (201)', async () => {
    const email = uniqueEmail('reg.ok');
    const res = await request(app).post('/api/auth/register').send({
      email,
      password: STRONG_PASSWORD,
      first_name: 'Ada',
      last_name: 'Lovelace',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe(email);
    // The hash must never leave the server.
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('rejects a duplicate email (409)', async () => {
    const email = uniqueEmail('reg.dup');
    await registerUser({ email });

    const res = await request(app).post('/api/auth/register').send({
      email,
      password: STRONG_PASSWORD,
      first_name: 'Dup',
      last_name: 'Licate',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects a missing required field (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail('reg.missing'), password: STRONG_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a weak password (400)', async () => {
    // Contract: password must be >= 8 chars with upper/lower/number.
    const res = await request(app).post('/api/auth/register').send({
      email: uniqueEmail('reg.weak'),
      password: '123',
      first_name: 'Weak',
      last_name: 'Pass',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and returns an access token', async () => {
    const email = uniqueEmail('login.ok');
    await registerUser({ email });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    // Refresh token is delivered as an httpOnly cookie, not in the body.
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.join(';')).toMatch(/refreshToken/i);
  });

  it('rejects a wrong password (401)', async () => {
    const email = uniqueEmail('login.wrong');
    await registerUser({ email });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Wrong1234' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects an unknown email (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail('login.ghost'), password: STRONG_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('rejects missing credentials (400)', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('locks the account after repeated failed attempts', async () => {
    const email = uniqueEmail('login.lock');
    await registerUser({ email });

    // Hammer wrong-password attempts past the lockout threshold (5).
    let last;
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      last = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Nope1234' });
    }

    // Even the correct password should now be refused while locked
    // (423 Locked or 401/403 depending on how the controller frames it).
    const afterLock = await request(app)
      .post('/api/auth/login')
      .send({ email, password: STRONG_PASSWORD });

    expect([401, 403, 423]).toContain(last.status);
    expect([401, 403, 423]).toContain(afterLock.status);
  });
});

describe('POST /api/auth/refresh-token', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const { loginRes } = await loginUser({ email: uniqueEmail('refresh.ok') });
    const cookie = (loginRes.headers['set-cookie'] || []).find((c) =>
      /refreshToken/i.test(c)
    );
    expect(cookie).toBeDefined();

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    // Rotation: a fresh refresh cookie should be set on the response.
    const rotated = (res.headers['set-cookie'] || []).join(';');
    expect(rotated).toMatch(/refreshToken/i);
  });

  it('rejects a missing refresh token (401)', async () => {
    const res = await request(app).post('/api/auth/refresh-token');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage refresh token (401)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', 'refreshToken=not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the refresh cookie', async () => {
    const { loginRes } = await loginUser({ email: uniqueEmail('logout.ok') });
    const cookie = (loginRes.headers['set-cookie'] || []).find((c) =>
      /refreshToken/i.test(c)
    );

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie || '');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The Set-Cookie should expire/clear the refresh cookie.
    const setCookie = (res.headers['set-cookie'] || []).join(';');
    expect(setCookie).toMatch(/refreshToken=;|Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });
});

describe('GET /api/auth/profile', () => {
  it('returns the authenticated user with a valid bearer token', async () => {
    const { token } = await loginUser({ email: uniqueEmail('profile.ok') });

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });
});
