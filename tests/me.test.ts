import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { errorHandler } from '../src/middleware/error.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { UserModel } from '../src/modules/users/users.model.js';
import { app, bearer, EMAILS, expectError, login, seed, tokenFor } from './helpers.js';

let id: (mockId: string) => string;

beforeEach(async () => {
  ({ id } = await seed());
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
    const expired = jwt.sign(
      { role: 'admin', tv: 0, exp: Math.floor(Date.now() / 1000) - 60 },
      env.JWT_ACCESS_SECRET,
      { subject: id('u_001') },
    );
    expectError(await getMe(expired), 401, 'UNAUTHORIZED');
  });

  it('rejects a refresh token used as an access token', async () => {
    const { refreshToken } = await login(EMAILS.admin);
    expectError(await getMe(refreshToken), 401, 'UNAUTHORIZED');
  });

  it('rejects a user who became inactive (spec §4)', async () => {
    const token = await tokenFor(EMAILS.staff);
    await UserModel.updateOne({ email: EMAILS.staff }, { status: 'inactive' });
    expectError(await getMe(token), 401, 'UNAUTHORIZED');
  });

  it('rejects a user who was deleted', async () => {
    const token = await tokenFor(EMAILS.staff);
    await UserModel.deleteOne({ email: EMAILS.staff });
    expectError(await getMe(token), 401, 'UNAUTHORIZED');
  });

  it('rejects a token whose tv no longer matches (revoked)', async () => {
    const token = await tokenFor(EMAILS.staff);
    await UserModel.updateOne({ email: EMAILS.staff }, { $inc: { tokenVersion: 1 } });
    expectError(await getMe(token), 401, 'UNAUTHORIZED');
  });

  it('uses the current role from the database, not the one in the token', async () => {
    const token = await tokenFor(EMAILS.admin);
    await UserModel.updateOne({ email: EMAILS.admin }, { role: 'staff' });
    expectError(await request(app).get('/api/v1/users').set(bearer(token)), 403, 'FORBIDDEN');
  });
});

describe('GET /me', () => {
  it.each([
    ['admin', EMAILS.admin, 'u_001'],
    ['staff', EMAILS.staff, 'u_004'],
    ['user', EMAILS.user, 'u_002'],
  ])('returns the current %s with the exact User shape', async (role, email, mockId) => {
    const res = await getMe(await tokenFor(email));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: id(mockId), email, role, status: 'active' });
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['avatarUrl', 'createdAt', 'email', 'id', 'name', 'phone', 'role', 'status'].sort(),
    );
  });
});

describe('PATCH /me', () => {
  const patchMe = async (body: object) =>
    request(app).patch('/api/v1/me').set(bearer(await tokenFor(EMAILS.user))).send(body);

  it('updates name, phone and avatarUrl', async () => {
    const res = await patchMe({ name: 'Priya S.', phone: '+91 91111 11111', avatarUrl: 'https://cdn.example.com/p.png' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: id('u_002'),
      name: 'Priya S.',
      phone: '+91 91111 11111',
      avatarUrl: 'https://cdn.example.com/p.png',
    });
  });

  it('can clear phone and avatarUrl with null', async () => {
    expect((await patchMe({ phone: null, avatarUrl: null })).body.data).toMatchObject({ phone: null, avatarUrl: null });
  });

  it('ignores every other field (role, status, email, id)', async () => {
    const res = await patchMe({ role: 'admin', status: 'inactive', email: 'hacker@example.com', id: 'x' });
    expect(res.body.data).toMatchObject({ id: id('u_002'), role: 'user', status: 'active', email: EMAILS.user });
  });

  it.each([
    ['an empty name', { name: '  ' }],
    ['a non-text name', { name: 42 }],
  ])('rejects %s with 422 VALIDATION_ERROR', async (_label, body) => {
    expectError(await patchMe(body), 422, 'VALIDATION_ERROR');
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
