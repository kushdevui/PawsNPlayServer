import { beforeEach, describe, expect, it } from 'vitest';
import { RefreshTokenModel } from '../src/modules/auth/refreshToken.model.js';
import { UserModel } from '../src/modules/users/users.model.js';
import { EMAILS, expectError, ids, login, seededWorld, type Clients, as } from './helpers.js';

let c: Clients;
let id: (mockId: string) => string;

beforeEach(async () => {
  ({ c, id } = await seededWorld());
});

const mockIds = (...list: string[]) => list.map((m) => id(m));

describe('roles (spec §4: users = admin only)', () => {
  it.each(['staff', 'user'] as const)('%s gets 403 on every users endpoint', async (role) => {
    expectError(await c[role].get('/users'), 403, 'FORBIDDEN');
    expectError(await c[role].get(`/users/${id('u_002')}`), 403, 'FORBIDDEN');
    expectError(await c[role].patch(`/users/${id('u_002')}`, { role: 'admin' }), 403, 'FORBIDDEN');
  });

  it('anonymous gets 401', async () => {
    expectError(await c.anonymous.get('/users'), 401, 'UNAUTHORIZED');
  });
});

describe('GET /users', () => {
  it('lists users (oldest first) with the list envelope and no secrets', async () => {
    const res = await c.admin.get('/users');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 8, page: 1, limit: 50 });
    expect(ids(res)).toEqual(mockIds('u_001', 'u_007', 'u_008', 'u_004', 'u_005', 'u_002', 'u_003', 'u_006'));
    expect(JSON.stringify(res.body)).not.toMatch(/password|tokenVersion/i);
  });

  it('filters by role and status, searches name/email case-insensitively', async () => {
    expect(ids(await c.admin.get('/users?role=staff'))).toEqual(mockIds('u_004', 'u_005'));
    expect(ids(await c.admin.get('/users?status=inactive'))).toEqual(mockIds('u_006'));
    expect(ids(await c.admin.get('/users?search=PRIYA'))).toEqual(mockIds('u_002'));
    expect(ids(await c.admin.get('/users?search=.*'))).toEqual([]);
  });

  it('ignores unknown query params and paginates', async () => {
    const res = await c.admin.get('/users?page=2&limit=3&foo=bar');
    expect(ids(res)).toEqual(mockIds('u_004', 'u_005', 'u_002'));
    expect(res.body.meta).toEqual({ total: 8, page: 2, limit: 3 });
  });
});

describe('GET /users/:id', () => {
  it('returns one user, 404 "User not found" for unknown or malformed ids', async () => {
    expect((await c.admin.get(`/users/${id('u_004')}`)).body.data).toMatchObject({ role: 'staff', email: EMAILS.staff });
    expectError(await c.admin.get('/users/0123456789abcdef01234567'), 404, 'NOT_FOUND', 'User not found');
    expectError(await c.admin.get('/users/u_001'), 404, 'NOT_FOUND', 'User not found');
  });
});

describe('PATCH /users/:id', () => {
  it('changes role and status only', async () => {
    const res = await c.admin.patch(`/users/${id('u_003')}`, { role: 'staff', name: 'Hacked', email: 'x@example.com' });
    expect(res.body.data).toMatchObject({ role: 'staff', name: 'Rohan Mehta', email: 'rohan@example.com' });
  });

  it('invalid values -> "Invalid role." / "Invalid status."', async () => {
    expectError(await c.admin.patch(`/users/${id('u_002')}`, { role: 'boss' }), 422, 'VALIDATION_ERROR', 'Invalid role.');
    expectError(await c.admin.patch(`/users/${id('u_002')}`, { status: 'gone' }), 422, 'VALIDATION_ERROR', 'Invalid status.');
  });

  it('deactivating revokes tokens (tokenVersion bump)', async () => {
    const neha = await login(EMAILS.staff);
    await c.admin.patch(`/users/${id('u_004')}`, { status: 'inactive' }).expect(200);

    expectError(await as(neha.accessToken).get('/me'), 401, 'UNAUTHORIZED');
    expect(await RefreshTokenModel.countDocuments({ userId: id('u_004') })).toBe(0);
    expect((await UserModel.findById(id('u_004')).lean())?.tokenVersion).toBe(1);
  });

  it('404 for an unknown user', async () => {
    expectError(await c.admin.patch('/users/0123456789abcdef01234567', { role: 'staff' }), 404, 'NOT_FOUND');
  });
});
