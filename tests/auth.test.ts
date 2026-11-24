import jwt, { type JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { seedDatabase } from '../src/db/seed.js';
import { RefreshTokenModel } from '../src/modules/auth/refreshToken.model.js';
import { UserModel } from '../src/modules/users/users.model.js';
import { app, bearer, EMAILS, expectError, login, PASSWORD } from './helpers.js';

beforeEach(async () => {
  await seedDatabase();
});

const post = (path: string, body?: object) => {
  const req = request(app).post(`/api/v1${path}`);
  return body === undefined ? req : req.send(body);
};

describe('POST /auth/login', () => {
  it('returns accessToken, refreshToken and the public user', async () => {
    const res = await post('/auth/login', { email: EMAILS.admin, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: {
        id: 'u_001',
        name: 'Aarav Malhotra',
        email: EMAILS.admin,
        role: 'admin',
        phone: '+91 98100 00001',
        avatarUrl: null,
        status: 'active',
        createdAt: '2026-01-05T09:00:00.000Z',
      },
    });
  });

  it('puts the user id and role in the access token', async () => {
    const { accessToken } = await login(EMAILS.staff);
    const payload = jwt.verify(accessToken, env.JWT_ACCESS_SECRET) as JwtPayload;

    expect(payload.sub).toBe('u_004');
    expect(payload.role).toBe('staff');
  });

  it('treats the email case-insensitively', async () => {
    const res = await post('/auth/login', { email: '  PRIYA@Example.com ', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe('u_002');
  });

  it('stores only a hash of the refresh token', async () => {
    const { refreshToken } = await login(EMAILS.user);
    const stored = await RefreshTokenModel.find({ userId: 'u_002' }).lean();

    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(refreshToken);
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    expectError(await post('/auth/login', { email: EMAILS.user, password: 'nope' }), 401, 'INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with 401 INVALID_CREDENTIALS', async () => {
    expectError(
      await post('/auth/login', { email: 'ghost@example.com', password: PASSWORD }),
      401,
      'INVALID_CREDENTIALS',
    );
  });

  it('rejects a missing body with 401 INVALID_CREDENTIALS (like the mock)', async () => {
    expectError(await post('/auth/login'), 401, 'INVALID_CREDENTIALS');
  });

  it('rejects an inactive account with 403 ACCOUNT_INACTIVE', async () => {
    expectError(
      await post('/auth/login', { email: EMAILS.inactive, password: PASSWORD }),
      403,
      'ACCOUNT_INACTIVE',
    );
  });

  it('checks the password before revealing that an account is inactive', async () => {
    expectError(await post('/auth/login', { email: EMAILS.inactive, password: 'nope' }), 401, 'INVALID_CREDENTIALS');
  });
});

describe('POST /auth/register', () => {
  const newUser = { name: 'Kabir Rao', email: 'Kabir@Example.com', password: 'secret123', phone: '+91 90000 00000' };

  it('creates an active user-role account and returns tokens (201)', async () => {
    const res = await post('/auth/register', { ...newUser, role: 'admin', status: 'inactive' });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).toEqual({
      id: expect.stringMatching(/^u_[0-9a-f]{12}$/),
      name: 'Kabir Rao',
      email: 'kabir@example.com',
      role: 'user',
      phone: '+91 90000 00000',
      avatarUrl: null,
      status: 'active',
      createdAt: expect.any(String),
    });
  });

  it('lets the new user log in', async () => {
    await post('/auth/register', newUser);
    const session = await login('kabir@example.com', 'secret123');
    expect(session.user.role).toBe('user');
  });

  it('defaults phone to null', async () => {
    const res = await post('/auth/register', { name: 'A', email: 'a@example.com', password: 'secret123' });
    expect(res.body.data.user.phone).toBeNull();
  });

  it('rejects a duplicate email (any case) with 422 EMAIL_TAKEN', async () => {
    expectError(await post('/auth/register', { ...newUser, email: 'PRIYA@example.com' }), 422, 'EMAIL_TAKEN');
  });

  it('requires name, email and password (422 VALIDATION_ERROR)', async () => {
    const res = await post('/auth/register', { email: 'x@example.com' });
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Name, email and password are required.');
  });

  it('rejects an invalid email', async () => {
    expectError(await post('/auth/register', { ...newUser, email: 'not-an-email' }), 422, 'VALIDATION_ERROR');
  });

  it('rejects a short password', async () => {
    expectError(await post('/auth/register', { ...newUser, password: 'short' }), 422, 'VALIDATION_ERROR');
  });
});

describe('POST /auth/refresh', () => {
  it('returns only a new accessToken that works', async () => {
    const { refreshToken } = await login(EMAILS.user);
    const res = await post('/auth/refresh', { refreshToken });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data)).toEqual(['accessToken']);
    const me = await request(app).get('/api/v1/me').set(bearer(res.body.data.accessToken));
    expect(me.body.data.id).toBe('u_002');
  });

  it.each([
    ['missing', undefined],
    ['garbage', 'not-a-token'],
  ])('rejects a %s token with 401 INVALID_TOKEN', async (_label, refreshToken) => {
    expectError(await post('/auth/refresh', { refreshToken }), 401, 'INVALID_TOKEN');
  });

  it('rejects an access token used as a refresh token', async () => {
    const { accessToken } = await login(EMAILS.user);
    expectError(await post('/auth/refresh', { refreshToken: accessToken }), 401, 'INVALID_TOKEN');
  });

  it('rejects a validly signed token that was never stored', async () => {
    const forged = jwt.sign({}, env.JWT_REFRESH_SECRET, { subject: 'u_002', jwtid: 'rt_unknown', expiresIn: '1h' });
    expectError(await post('/auth/refresh', { refreshToken: forged }), 401, 'INVALID_TOKEN');
  });

  it('rejects the token of a user who became inactive', async () => {
    const { refreshToken } = await login(EMAILS.user);
    await UserModel.updateOne({ _id: 'u_002' }, { status: 'inactive' });
    expectError(await post('/auth/refresh', { refreshToken }), 401, 'INVALID_TOKEN');
  });
});

describe('POST /auth/logout', () => {
  it('requires authentication (401 UNAUTHORIZED)', async () => {
    expectError(await post('/auth/logout'), 401, 'UNAUTHORIZED');
  });

  it('with no body, revokes all of the user’s refresh tokens', async () => {
    const phone = await login(EMAILS.user);
    const tablet = await login(EMAILS.user);

    const res = await request(app).post('/api/v1/auth/logout').set(bearer(phone.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { success: true } });

    expectError(await post('/auth/refresh', { refreshToken: phone.refreshToken }), 401, 'INVALID_TOKEN');
    expectError(await post('/auth/refresh', { refreshToken: tablet.refreshToken }), 401, 'INVALID_TOKEN');
  });

  it('with a refreshToken, revokes only that session', async () => {
    const phone = await login(EMAILS.user);
    const tablet = await login(EMAILS.user);

    await request(app)
      .post('/api/v1/auth/logout')
      .set(bearer(phone.accessToken))
      .send({ refreshToken: phone.refreshToken })
      .expect(200);

    expectError(await post('/auth/refresh', { refreshToken: phone.refreshToken }), 401, 'INVALID_TOKEN');
    expect((await post('/auth/refresh', { refreshToken: tablet.refreshToken })).status).toBe(200);
  });

  it('cannot revoke another user’s refresh token', async () => {
    const priya = await login(EMAILS.user);
    const rohan = await login(EMAILS.otherUser);

    await request(app)
      .post('/api/v1/auth/logout')
      .set(bearer(rohan.accessToken))
      .send({ refreshToken: priya.refreshToken })
      .expect(200);

    expect((await post('/auth/refresh', { refreshToken: priya.refreshToken })).status).toBe(200);
  });
});
