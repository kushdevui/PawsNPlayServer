import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { seedDatabase } from '../src/db/seed.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { errorHandler } from '../src/middleware/error.js';
import { UserModel } from '../src/modules/users/users.model.js';
import { app, bearer, EMAILS, expectError, login } from './helpers.js';

beforeEach(async () => {
  await seedDatabase();
});

const getMe = (token?: string) => {
  const req = request(app).get('/api/v1/me');
  return token ? req.set(bearer(token)) : req;
};

describe('requireAuth', () => {
  it('rejects a request without a token', async () => {
    expectError(await getMe(), 401, 'UNAUTHORIZED');
  });

  it.each([
    ['a malformed header', 'Token abc'],
    ['an empty bearer', 'Bearer '],
    ['a garbage token', 'Bearer not-a-jwt'],
  ])('rejects %s', async (_label, header) => {
    expectError(await request(app).get('/api/v1/me').set('Authorization', header), 401, 'UNAUTHORIZED');
  });

  it('rejects an expired access token', async () => {
    const expired = jwt.sign({ role: 'user', exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_ACCESS_SECRET, {
      subject: 'u_002',
    });
    expectError(await getMe(expired), 401, 'UNAUTHORIZED');
  });

  it('rejects a refresh token used as an access token', async () => {
    const { refreshToken } = await login(EMAILS.user);
    expectError(await getMe(refreshToken), 401, 'UNAUTHORIZED');
  });

  it('rejects a user who became inactive after logging in', async () => {
    const { accessToken } = await login(EMAILS.user);
    await UserModel.updateOne({ _id: 'u_002' }, { status: 'inactive' });
    expectError(await getMe(accessToken), 401, 'UNAUTHORIZED');
  });

  it('rejects a user who was deleted after logging in', async () => {
    const { accessToken } = await login(EMAILS.user);
    await UserModel.deleteOne({ _id: 'u_002' });
    expectError(await getMe(accessToken), 401, 'UNAUTHORIZED');
  });

  it('uses the current role from the database, not the one in the token', async () => {
    const { accessToken } = await login(EMAILS.admin);
    await UserModel.updateOne({ _id: 'u_001' }, { role: 'user' });
    const res = await request(app).get('/api/v1/users').set(bearer(accessToken));
    expectError(res, 403, 'FORBIDDEN');
  });
});

describe('GET /me', () => {
  it.each([
    ['admin', EMAILS.admin, 'u_001'],
    ['user', EMAILS.user, 'u_002'],
    ['staff', EMAILS.staff, 'u_004'],
  ])('returns the current %s without secrets', async (role, email, id) => {
    const { accessToken } = await login(email);
    const res = await getMe(accessToken);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, email, role, status: 'active' });
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['avatarUrl', 'createdAt', 'email', 'id', 'name', 'phone', 'role', 'status'].sort(),
    );
  });
});

describe('PATCH /me', () => {
  const patchMe = async (body: object) => {
    const { accessToken } = await login(EMAILS.user);
    return request(app).patch('/api/v1/me').set(bearer(accessToken)).send(body);
  };

  it('updates name, phone and avatarUrl', async () => {
    const res = await patchMe({ name: 'Priya S.', phone: '+91 91111 11111', avatarUrl: 'https://cdn.example.com/p.png' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: 'u_002',
      name: 'Priya S.',
      phone: '+91 91111 11111',
      avatarUrl: 'https://cdn.example.com/p.png',
    });
  });

  it('can clear phone and avatarUrl with null', async () => {
    const res = await patchMe({ phone: null, avatarUrl: null });
    expect(res.body.data).toMatchObject({ phone: null, avatarUrl: null });
  });

  it('ignores every other field (role, status, email, id)', async () => {
    const res = await patchMe({ role: 'admin', status: 'inactive', email: 'hacker@example.com', id: 'u_999' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'u_002', role: 'user', status: 'active', email: EMAILS.user });
  });

  it('returns the unchanged user for an empty body', async () => {
    const res = await patchMe({});
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Priya Sharma');
  });

  it.each([
    ['an empty name', { name: '  ' }],
    ['a non-text name', { name: 42 }],
    ['an invalid avatarUrl', { avatarUrl: 'not a url' }],
  ])('rejects %s with 422 VALIDATION_ERROR', async (_label, body) => {
    expectError(await patchMe(body), 422, 'VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    expectError(await request(app).patch('/api/v1/me').send({ name: 'X' }), 401, 'UNAUTHORIZED');
  });
});

describe('rate limiting', () => {
  it('answers 429 RATE_LIMITED in the error envelope after the limit', async () => {
    const limited = express();
    limited.post('/login', createRateLimiter({ limit: 2 }), (_req, res) => {
      res.json({ data: { ok: true } });
    });
    limited.use(errorHandler);

    await request(limited).post('/login').expect(200);
    await request(limited).post('/login').expect(200);
    expectError(await request(limited).post('/login'), 429, 'RATE_LIMITED');
  });
});
