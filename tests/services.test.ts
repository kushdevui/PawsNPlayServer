import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/db/seed.js';
import { expectError, ids, loginAll, type Clients } from './helpers.js';

let c: Clients;

beforeEach(async () => {
  await seedDatabase();
  c = await loginAll();
});

describe('GET /services', () => {
  it.each(['user', 'staff'] as const)('%s sees only active services', async (role) => {
    const res = await c[role].get('/services');
    expect(ids(res)).toEqual(['s_001', 's_002', 's_003', 's_004']);
    expect(res.body.meta).toEqual({ total: 4, page: 1, limit: 20 });
  });

  it('admin sees inactive services too', async () => {
    expect(ids(await c.admin.get('/services'))).toEqual(['s_001', 's_002', 's_003', 's_004', 's_005']);
  });

  it('filters by category', async () => {
    expect(ids(await c.user.get('/services?category=walking'))).toEqual(['s_004']);
    expect(ids(await c.user.get('/services?category=training'))).toEqual([]); // inactive
    expect(ids(await c.admin.get('/services?category=training'))).toEqual(['s_005']);
  });

  it('rejects an unknown category', async () => {
    expectError(await c.user.get('/services?category=spa'), 422, 'VALIDATION_ERROR');
  });

  it('requires a token', async () => {
    expectError(await c.anonymous.get('/services'), 401, 'UNAUTHORIZED');
  });
});

describe('GET /services/:id', () => {
  it('returns an active service with the exact Service shape', async () => {
    const res = await c.user.get('/services/s_001');
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['active', 'category', 'currency', 'description', 'durationMinutes', 'id', 'name', 'price', 'speciesAllowed'].sort(),
    );
  });

  it.each(['user', 'staff'] as const)('inactive service is 404 for %s', async (role) => {
    expectError(await c[role].get('/services/s_005'), 404, 'NOT_FOUND');
  });

  it('admin can read an inactive service', async () => {
    expect((await c.admin.get('/services/s_005')).body.data.active).toBe(false);
  });
});

describe('POST /services', () => {
  it('admin creates a service with the mock defaults (201)', async () => {
    const res = await c.admin.post('/services', { name: 'Nail Trim', category: 'grooming', price: 199, id: 's_hack' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.stringMatching(/^s_[0-9a-f]{12}$/),
      name: 'Nail Trim',
      category: 'grooming',
      description: '',
      durationMinutes: 60,
      price: 199,
      currency: 'INR',
      speciesAllowed: ['dog', 'cat'],
      active: true,
    });
  });

  it('keeps provided values', async () => {
    const body = {
      name: 'Puppy School',
      category: 'training',
      description: 'Basics.',
      durationMinutes: 45,
      price: 650,
      speciesAllowed: ['dog'],
      active: false,
    };
    expect((await c.admin.post('/services', body)).body.data).toMatchObject(body);
  });

  it('requires name, category and price', async () => {
    const res = await c.admin.post('/services', { name: 'X', category: 'play' });
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Name, category and price are required.');
  });

  it.each([
    ['a zero price', { price: 0 }],
    ['an unknown category', { category: 'spa' }],
    ['no species', { speciesAllowed: [] }],
    ['an unknown species', { speciesAllowed: ['bird'] }],
  ])('rejects %s', async (_label, override) => {
    const body = { name: 'X', category: 'play', price: 100, ...override };
    expectError(await c.admin.post('/services', body), 422, 'VALIDATION_ERROR');
  });

  it.each(['user', 'staff'] as const)('%s cannot create services (403)', async (role) => {
    expectError(await c[role].post('/services', { name: 'X', category: 'play', price: 1 }), 403, 'FORBIDDEN');
  });
});

describe('PATCH /services/:id', () => {
  it('admin updates fields; id is not updatable', async () => {
    const res = await c.admin.patch('/services/s_003', { price: 449, id: 's_999' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 's_003', price: 449, name: 'Play Session' });
  });

  it('deactivating hides the service from non-admins', async () => {
    await c.admin.patch('/services/s_004', { active: false }).expect(200);
    expectError(await c.user.get('/services/s_004'), 404, 'NOT_FOUND');
  });

  it('returns 404 for an unknown id', async () => {
    expectError(await c.admin.patch('/services/s_999', { price: 1 }), 404, 'NOT_FOUND');
  });

  it.each(['user', 'staff'] as const)('%s cannot update services (403)', async (role) => {
    expectError(await c[role].patch('/services/s_001', { price: 1 }), 403, 'FORBIDDEN');
  });
});
