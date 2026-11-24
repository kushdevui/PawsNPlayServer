import jwt, { type JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { RefreshTokenModel } from '../src/modules/auth/refreshToken.model.js';
import { UserModel } from '../src/modules/users/users.model.js';
import { app, bearer, EMAILS, expectError, login, PASSWORD, seed, tokenFor } from './helpers.js';

let id: (mockId: string) => string;

beforeEach(async () => {
  ({ id } = await seed());
});

const post = (path: string, body?: object) => {
  const req = request(app).post(`/api/v1${path}`);
  return body === undefined ? req : req.send(body);
};
const logout = (accessToken: string, body?: object) => {
  const req = request(app).post('/api/v1/auth/logout').set(bearer(accessToken));
  return body === undefined ? req : req.send(body);
};

describe('POST /auth/login (spec §11 Auth)', () => {
  it('Kush / password123 -> 200, role admin, tokens and the public user', async () => {
    const res = await post('/auth/login', { email: EMAILS.admin, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: {
        id: id('u_001'),
        name: 'Kush',
        email: EMAILS.admin,
        role: 'admin',
        phone: '+91 98100 00001',
        avatarUrl: null,
        status: 'active',
        createdAt: '2026-01-05T09:00:00.000Z',
      },
    });
  });

  it('access token carries sub, role and tv (spec §9)', async () => {
    const { accessToken } = await login(EMAILS.staff);
    const payload = jwt.verify(accessToken, env.JWT_ACCESS_SECRET) as JwtPayload;
    expect(payload).toMatchObject({ sub: id('u_004'), role: 'staff', tv: 0 });
  });

  it('treats the email case-insensitively', async () => {
    const res = await post('/auth/login', { email: '  KUSH@PawsNPlay.com ', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('stores only a hash of the refresh token', async () => {
    const { refreshToken } = await login(EMAILS.admin);
    const stored = await RefreshTokenModel.find({ userId: id('u_001') }).lean();
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
  });

  it('wrong password -> 401 INVALID_CREDENTIALS', async () => {
    expectError(
      await post('/auth/login', { email: EMAILS.admin, password: 'nope' }),
      401,
      'INVALID_CREDENTIALS',
      'Email or password is incorrect.',
    );
  });

  it('unknown email or missing body -> 401 INVALID_CREDENTIALS', async () => {
    expectError(
      await post('/auth/login', { email: 'ghost@example.com', password: PASSWORD }),
      401,
      'INVALID_CREDENTIALS',
    );
    expectError(await post('/auth/login'), 401, 'INVALID_CREDENTIALS');
  });

  it('Ananya (inactive) -> 403 ACCOUNT_INACTIVE', async () => {
    expectError(
      await post('/auth/login', { email: EMAILS.inactive, password: PASSWORD }),
      403,
      'ACCOUNT_INACTIVE',
      'This account is inactive. Contact support.',
    );
  });
});

describe('POST /auth/register', () => {
  const newUser = { name: 'Kabir Rao', email: 'Kabir@Example.com', password: 'secret123', phone: '+91 90000 00000' };

  it('creates an active user-role account and returns tokens (201)', async () => {
    const res = await post('/auth/register', { ...newUser, role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      name: 'Kabir Rao',
      email: 'kabir@example.com',
      role: 'user',
      phone: '+91 90000 00000',
      avatarUrl: null,
      status: 'active',
      createdAt: expect.any(String),
    });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('existing email (any case) -> 422 EMAIL_TAKEN', async () => {
    expectError(
      await post('/auth/register', { ...newUser, email: 'PRIYA@example.com' }),
      422,
      'EMAIL_TAKEN',
      'This email is already registered.',
    );
  });

  it('missing fields -> 422 "Name, email and password are required."', async () => {
    expectError(
      await post('/auth/register', { email: 'x@example.com' }),
      422,
      'VALIDATION_ERROR',
      'Name, email and password are required.',
    );
  });

  it('password shorter than 8 -> 422', async () => {
    expectError(await post('/auth/register', { ...newUser, password: 'short' }), 422, 'VALIDATION_ERROR');
  });
});

describe('POST /auth/refresh', () => {
  it('valid refresh token -> a new access token that works', async () => {
    const { refreshToken } = await login(EMAILS.admin);
    const res = await post('/auth/refresh', { refreshToken });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data)).toEqual(['accessToken']);
    const me = await request(app).get('/api/v1/me').set(bearer(res.body.data.accessToken));
    expect(me.body.data.id).toBe(id('u_001'));
  });

  it('after logout -> 401 INVALID_TOKEN (spec §11)', async () => {
    const session = await login(EMAILS.admin);
    await logout(session.accessToken, { refreshToken: session.refreshToken }).expect(200);
    expectError(
      await post('/auth/refresh', { refreshToken: session.refreshToken }),
      401,
      'INVALID_TOKEN',
      'Session expired.',
    );
  });

  it('missing, garbage or access token -> 401 INVALID_TOKEN', async () => {
    const { accessToken } = await login(EMAILS.admin);
    expectError(await post('/auth/refresh', {}), 401, 'INVALID_TOKEN');
    expectError(await post('/auth/refresh', { refreshToken: 'not-a-token' }), 401, 'INVALID_TOKEN');
    expectError(await post('/auth/refresh', { refreshToken: accessToken }), 401, 'INVALID_TOKEN');
  });

  it('user deactivated -> 401 INVALID_TOKEN', async () => {
    const { refreshToken } = await login(EMAILS.staff);
    await UserModel.updateOne({ email: EMAILS.staff }, { status: 'inactive' });
    expectError(await post('/auth/refresh', { refreshToken }), 401, 'INVALID_TOKEN');
  });

  it('tokenVersion bumped -> 401 INVALID_TOKEN', async () => {
    const { refreshToken } = await login(EMAILS.staff);
    await UserModel.updateOne({ email: EMAILS.staff }, { $inc: { tokenVersion: 1 } });
    expectError(await post('/auth/refresh', { refreshToken }), 401, 'INVALID_TOKEN');
  });
});

describe('POST /auth/logout', () => {
  it('requires authentication', async () => {
    expectError(await post('/auth/logout'), 401, 'UNAUTHORIZED');
  });

  it('with a refreshToken revokes only that session', async () => {
    const phone = await login(EMAILS.admin);
    const tablet = await login(EMAILS.admin);
    await logout(phone.accessToken, { refreshToken: phone.refreshToken }).expect(200);

    expectError(await post('/auth/refresh', { refreshToken: phone.refreshToken }), 401, 'INVALID_TOKEN');
    expect((await post('/auth/refresh', { refreshToken: tablet.refreshToken })).status).toBe(200);
  });

  it('without a body logs out everywhere (refresh and access tokens stop working)', async () => {
    const phone = await login(EMAILS.admin);
    const tablet = await login(EMAILS.admin);
    const res = await logout(phone.accessToken);
    expect(res.body).toEqual({ data: { success: true } });

    expectError(await post('/auth/refresh', { refreshToken: tablet.refreshToken }), 401, 'INVALID_TOKEN');
    expectError(await request(app).get('/api/v1/me').set(bearer(tablet.accessToken)), 401, 'UNAUTHORIZED');
  });
});

describe('roles (spec §4)', () => {
  it('GET /me without token -> 401 UNAUTHORIZED', async () => {
    expectError(await request(app).get('/api/v1/me'), 401, 'UNAUTHORIZED');
  });

  it('as `user` role, GET /dogs -> 403 FORBIDDEN', async () => {
    const token = await tokenFor(EMAILS.user);
    expectError(await request(app).get('/api/v1/dogs').set(bearer(token)), 403, 'FORBIDDEN');
  });
});
