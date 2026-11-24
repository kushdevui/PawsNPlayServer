import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/db/seed.js';
import { RefreshTokenModel } from '../src/modules/auth/refreshToken.model.js';
import { app, bearer, EMAILS, expectError, login } from './helpers.js';

let adminToken: string;

beforeEach(async () => {
  await seedDatabase();
  adminToken = (await login(EMAILS.admin)).accessToken;
});

const asAdmin = {
  get: (path: string) => request(app).get(`/api/v1${path}`).set(bearer(adminToken)),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set(bearer(adminToken)).send(body),
};
const ids = (res: request.Response) => (res.body.data as Array<{ id: string }>).map((u) => u.id);

describe('roles', () => {
  it.each([
    ['GET', '/users'],
    ['GET', '/users/u_002'],
    ['PATCH', '/users/u_002'],
  ])('%s %s needs a token (401)', async (method, path) => {
    const req = method === 'GET' ? request(app).get(`/api/v1${path}`) : request(app).patch(`/api/v1${path}`);
    expectError(await req, 401, 'UNAUTHORIZED');
  });

  it.each([
    ['user', EMAILS.user],
    ['staff', EMAILS.staff],
  ])('%s gets 403 FORBIDDEN on every users endpoint', async (_role, email) => {
    const { accessToken } = await login(email);
    const auth = bearer(accessToken);

    expectError(await request(app).get('/api/v1/users').set(auth), 403, 'FORBIDDEN');
    expectError(await request(app).get('/api/v1/users/u_002').set(auth), 403, 'FORBIDDEN');
    expectError(
      await request(app).patch('/api/v1/users/u_002').set(auth).send({ role: 'admin' }),
      403,
      'FORBIDDEN',
    );
  });
});

describe('GET /users', () => {
  it('lists all users (oldest first) with the list envelope and no secrets', async () => {
    const res = await asAdmin.get('/users');

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 6, page: 1, limit: 20 });
    expect(ids(res)).toEqual(['u_001', 'u_004', 'u_005', 'u_002', 'u_003', 'u_006']);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('filters by role', async () => {
    const res = await asAdmin.get('/users?role=staff');
    expect(ids(res)).toEqual(['u_004', 'u_005']);
    expect(res.body.meta.total).toBe(2);
  });

  it('filters by status', async () => {
    expect(ids(await asAdmin.get('/users?status=inactive'))).toEqual(['u_006']);
  });

  it('searches name and email case-insensitively', async () => {
    expect(ids(await asAdmin.get('/users?search=PRIYA'))).toEqual(['u_002']);
    expect(ids(await asAdmin.get('/users?search=staff%40pawsnplay'))).toEqual(['u_004', 'u_005']);
  });

  it('treats search text literally (no regex injection)', async () => {
    const res = await asAdmin.get('/users?search=.*');
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('combines filters', async () => {
    expect(ids(await asAdmin.get('/users?role=user&status=active'))).toEqual(['u_002', 'u_003']);
  });

  it('paginates', async () => {
    const res = await asAdmin.get('/users?page=2&limit=2');
    expect(ids(res)).toEqual(['u_005', 'u_002']);
    expect(res.body.meta).toEqual({ total: 6, page: 2, limit: 2 });
  });

  it('rejects an unknown role or status filter with 422', async () => {
    expectError(await asAdmin.get('/users?role=owner'), 422, 'VALIDATION_ERROR');
    expectError(await asAdmin.get('/users?status=banned'), 422, 'VALIDATION_ERROR');
  });
});

describe('GET /users/:id', () => {
  it('returns one user', async () => {
    const res = await asAdmin.get('/users/u_004');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'u_004', role: 'staff', email: EMAILS.staff });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('returns 404 NOT_FOUND for an unknown id', async () => {
    const res = await asAdmin.get('/users/u_999');
    expectError(res, 404, 'NOT_FOUND');
    expect(res.body.error.message).toBe('User not found');
  });
});

describe('PATCH /users/:id', () => {
  it('changes the role', async () => {
    const res = await asAdmin.patch('/users/u_003', { role: 'staff' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'u_003', role: 'staff', status: 'active' });
  });

  it('reactivates an inactive user', async () => {
    const res = await asAdmin.patch('/users/u_006', { status: 'active' });
    expect(res.body.data.status).toBe('active');
    expect((await login(EMAILS.inactive)).user.id).toBe('u_006');
  });

  it('deactivating a user ends their sessions', async () => {
    const priya = await login(EMAILS.user);
    await asAdmin.patch('/users/u_002', { status: 'inactive' }).expect(200);

    expectError(await request(app).get('/api/v1/me').set(bearer(priya.accessToken)), 401, 'UNAUTHORIZED');
    expect(await RefreshTokenModel.countDocuments({ userId: 'u_002' })).toBe(0);
    expectError(
      await request(app).post('/api/v1/auth/login').send({ email: EMAILS.user, password: 'password123' }),
      403,
      'ACCOUNT_INACTIVE',
    );
  });

  it('ignores fields other than role and status', async () => {
    const res = await asAdmin.patch('/users/u_002', { name: 'Hacked', email: 'x@example.com', role: 'staff' });
    expect(res.body.data).toMatchObject({ name: 'Priya Sharma', email: EMAILS.user, role: 'staff' });
  });

  it('rejects an invalid role or status with 422 VALIDATION_ERROR', async () => {
    const badRole = await asAdmin.patch('/users/u_002', { role: 'superadmin' });
    expectError(badRole, 422, 'VALIDATION_ERROR');
    expect(badRole.body.error.message).toBe('Invalid role.');

    const badStatus = await asAdmin.patch('/users/u_002', { status: 'banned' });
    expectError(badStatus, 422, 'VALIDATION_ERROR');
    expect(badStatus.body.error.message).toBe('Invalid status.');
  });

  it('returns 404 NOT_FOUND for an unknown id', async () => {
    expectError(await asAdmin.patch('/users/u_999', { role: 'staff' }), 404, 'NOT_FOUND');
  });
});
