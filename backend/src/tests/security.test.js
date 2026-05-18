/**
 * @file backend/src/tests/security.test.js
 * @description Security-focused integration tests: auth rate-limit
 *   enforcement, rejection of malformed / expired JWTs, refresh-token
 *   rotation correctness, stolen-token reuse detection (family
 *   revocation), and CSRF posture (bearer-token requirement).
 * @author Dev A
 *
 * Run against a disposable schema: `DB_NAME=hrms_test npm test`.
 *
 * NOTE on isolation: the login rate-limiter is per-IP with an in-memory
 * store, so the "rate limiting" block deliberately bursts requests and
 * WILL leave the limiter warm for the rest of the process. Run this
 * suite last (jest sorts alphabetically — `security` is late) or in its
 * own jest invocation if it interferes with other suites' logins.
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

describe('Auth rate limiting', () => {
  it('429s after exceeding the login attempt limit (5 / 15min)', async () => {
    const email = uniqueEmail('sec.rl');
    await registerUser({ email });

    const statuses = [];
    // 8 attempts > the documented max of 5 within the window.
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'WrongPass123' });
      statuses.push(res.status);
    }

    // The limiter must kick in at some point — at least one 429.
    expect(statuses).toContain(429);
    // And the limiter's body should be a structured error, not HTML.
    const limited = await request(app)
      .post('/api/auth/login')
      .send({ email, password: STRONG_PASSWORD });
    if (limited.status === 429) {
      expect(limited.body).toEqual(
        expect.objectContaining({ success: false })
      );
    }
  });
});

describe('JWT handling', () => {
  it('rejects a request with no token (401)', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed bearer token (401)', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer not.a.real.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a structurally-valid but bogus-signature token (401)', async () => {
    // header.payload.signature — base64 segments, invalid signature.
    const fake =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
      '.eyJzdWIiOiI5OTk5OTkiLCJpYXQiOjAsImV4cCI6OTk5OTk5OTk5OX0' +
      '.bm90LWEtdmFsaWQtc2lnbmF0dXJl';
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${fake}`);
    expect(res.status).toBe(401);
  });
});

describe('Refresh-token rotation + reuse detection', () => {
  const refreshCookie = (res) =>
    (res.headers['set-cookie'] || []).find((c) => /refreshToken/i.test(c));

  it('rotates the refresh token on each use', async () => {
    const { loginRes } = await loginUser({ email: uniqueEmail('sec.rot') });
    const c1 = refreshCookie(loginRes);
    expect(c1).toBeDefined();

    const r1 = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', c1);
    expect(r1.status).toBe(200);
    const c2 = refreshCookie(r1);
    expect(c2).toBeDefined();
    // Rotation: the issued cookie value must differ from the prior one.
    expect(c2).not.toBe(c1);
  });

  it('detects reuse of an already-rotated token and revokes the family', async () => {
    const { loginRes } = await loginUser({ email: uniqueEmail('sec.reuse') });
    const c1 = refreshCookie(loginRes);

    // First use rotates c1 → c2 (c1 is now spent).
    const first = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', c1);
    expect(first.status).toBe(200);

    // Replaying the SPENT c1 must be detected as theft/reuse.
    const replay = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', c1);
    expect(replay.status).toBe(401);
    // The controller surfaces a machine-readable reuse code.
    if (replay.body?.code) {
      expect(replay.body.code).toBe('ERR_REFRESH_REUSE_DETECTED');
    }

    // Family revoked: the successor c2 should now also be dead.
    const c2 = refreshCookie(first);
    const afterRevoke = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', c2);
    expect(afterRevoke.status).toBe(401);
  });
});

describe('CSRF posture', () => {
  it('state-changing requests require a bearer token, not ambient cookies', async () => {
    // A cross-site form post would carry cookies but NOT the
    // Authorization header. Protected mutations must still 401 — that
    // bearer-token requirement is what blunts classic CSRF here.
    const res = await request(app)
      .post('/api/departments')
      .set('Cookie', 'refreshToken=whatever')
      .send({ emertimi: 'CSRF attempt' });
    expect(res.status).toBe(401);
  });

  it('allows an explicit x-csrf-token header through CORS (no 4xx from header alone)', async () => {
    // The CORS allowlist permits x-csrf-token (added with the axios
    // interceptor). Sending it must not by itself break the request —
    // it should still just be an auth failure, not a CORS rejection.
    const res = await request(app)
      .get('/api/auth/profile')
      .set('x-csrf-token', 'sample-token');
    expect(res.status).toBe(401);
  });
});
