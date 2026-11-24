import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/db/seed.js';
import { expectError, ids, loginAll, type Clients } from './helpers.js';

let c: Clients;

beforeEach(async () => {
  await seedDatabase();
  c = await loginAll();
});

const newPet = { name: 'Tiger', species: 'cat', breed: 'Indie', gender: 'male', dateOfBirth: '2024-02-01', weightKg: 3.1 };

describe('GET /pets', () => {
  it('user sees only their own pets', async () => {
    const res = await c.user.get('/pets');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(['p_001', 'p_002']);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20 });
  });

  it('user filtering by another ownerId gets an empty list', async () => {
    const res = await c.user.get('/pets?ownerId=u_003');
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it.each(['staff', 'admin'] as const)('%s sees all pets', async (role) => {
    expect(ids(await c[role].get('/pets'))).toEqual(['p_001', 'p_002', 'p_003', 'p_004', 'p_005']);
  });

  it('filters by ownerId and species', async () => {
    expect(ids(await c.admin.get('/pets?ownerId=u_003'))).toEqual(['p_003', 'p_004']);
    expect(ids(await c.staff.get('/pets?species=cat'))).toEqual(['p_002', 'p_005']);
  });

  it('paginates', async () => {
    const res = await c.admin.get('/pets?page=2&limit=2');
    expect(ids(res)).toEqual(['p_003', 'p_004']);
    expect(res.body.meta).toEqual({ total: 5, page: 2, limit: 2 });
  });

  it('rejects an unknown species filter', async () => {
    expectError(await c.admin.get('/pets?species=bird'), 422, 'VALIDATION_ERROR');
  });

  it('requires a token', async () => {
    expectError(await c.anonymous.get('/pets'), 401, 'UNAUTHORIZED');
  });
});

describe('GET /pets/:id', () => {
  it('user gets their own pet with the exact Pet shape', async () => {
    const res = await c.user.get('/pets/p_001');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['breed', 'createdAt', 'dateOfBirth', 'gender', 'id', 'name', 'notes', 'ownerId', 'photoUrl', 'species', 'vaccinated', 'weightKg'].sort(),
    );
  });

  it('user gets 404 for someone else’s pet', async () => {
    expectError(await c.user.get('/pets/p_003'), 404, 'NOT_FOUND');
  });

  it.each(['staff', 'admin'] as const)('%s can read any pet', async (role) => {
    expect((await c[role].get('/pets/p_003')).body.data.ownerId).toBe('u_003');
  });

  it('returns 404 for an unknown id', async () => {
    expectError(await c.admin.get('/pets/p_999'), 404, 'NOT_FOUND');
  });
});

describe('POST /pets', () => {
  it('user creates a pet for themselves, ignoring ownerId (201)', async () => {
    const res = await c.user.post('/pets', { ...newPet, ownerId: 'u_003', id: 'p_hack', createdAt: '2000-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      ...newPet,
      id: expect.stringMatching(/^p_[0-9a-f]{12}$/),
      ownerId: 'u_002',
      vaccinated: false,
      notes: '',
      photoUrl: null,
      createdAt: expect.any(String),
    });
    expect(res.body.data.createdAt).not.toBe('2000-01-01');
  });

  it('applies the mock defaults when only name and species are sent', async () => {
    const res = await c.user.post('/pets', { name: 'Momo', species: 'dog' });
    expect(res.body.data).toMatchObject({
      breed: '',
      gender: 'male',
      dateOfBirth: '',
      weightKg: 0,
      vaccinated: false,
      notes: '',
      photoUrl: null,
    });
  });

  it('admin may set ownerId to an existing user', async () => {
    expect((await c.admin.post('/pets', { ...newPet, ownerId: 'u_003' })).body.data.ownerId).toBe('u_003');
  });

  it('admin gets 422 for an ownerId that does not exist', async () => {
    expectError(await c.admin.post('/pets', { ...newPet, ownerId: 'u_999' }), 422, 'VALIDATION_ERROR');
  });

  it('admin without ownerId owns the pet', async () => {
    expect((await c.admin.post('/pets', newPet)).body.data.ownerId).toBe('u_001');
  });

  it('staff cannot create pets (403)', async () => {
    expectError(await c.staff.post('/pets', newPet), 403, 'FORBIDDEN');
  });

  it('requires name and species', async () => {
    const res = await c.user.post('/pets', { breed: 'Pug' });
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Name and species are required.');
  });

  it.each([
    ['an unknown species', { species: 'bird' }],
    ['a bad date of birth', { dateOfBirth: '2024-13-45' }],
    ['a negative weight', { weightKg: -1 }],
    ['a bad gender', { gender: 'other' }],
  ])('rejects %s', async (_label, override) => {
    expectError(await c.user.post('/pets', { ...newPet, ...override }), 422, 'VALIDATION_ERROR');
  });
});

describe('PATCH /pets/:id', () => {
  it('user updates their own pet; id, ownerId and createdAt are not updatable', async () => {
    const before = (await c.user.get('/pets/p_001')).body.data;
    const res = await c.user.patch('/pets/p_001', {
      name: 'Bruno II',
      weightKg: 29,
      id: 'p_999',
      ownerId: 'u_003',
      createdAt: '2000-01-01T00:00:00.000Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ...before, name: 'Bruno II', weightKg: 29 });
  });

  it('user gets 404 for someone else’s pet', async () => {
    expectError(await c.user.patch('/pets/p_003', { name: 'Mine' }), 404, 'NOT_FOUND');
  });

  it('admin can update any pet', async () => {
    expect((await c.admin.patch('/pets/p_003', { vaccinated: false })).body.data.vaccinated).toBe(false);
  });

  it('staff cannot update pets (403)', async () => {
    expectError(await c.staff.patch('/pets/p_001', { name: 'X' }), 403, 'FORBIDDEN');
  });

  it('validates the fields it changes', async () => {
    expectError(await c.user.patch('/pets/p_001', { name: '' }), 422, 'VALIDATION_ERROR');
  });
});

describe('DELETE /pets/:id', () => {
  it('blocks deleting a pet with pending/confirmed bookings (422 INVALID_STATE)', async () => {
    expectError(await c.user.delete('/pets/p_002'), 422, 'INVALID_STATE'); // b_002 pending
    expectError(await c.user.delete('/pets/p_001'), 422, 'INVALID_STATE'); // b_001 confirmed
  });

  it('deletes once the bookings are cancelled', async () => {
    await c.user.patch('/bookings/b_002/status', { status: 'cancelled' }).expect(200);
    const res = await c.user.delete('/pets/p_002');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { success: true } });
    expectError(await c.user.get('/pets/p_002'), 404, 'NOT_FOUND');
  });

  it('admin can delete any pet without active bookings', async () => {
    expect((await c.admin.delete('/pets/p_005')).body).toEqual({ data: { success: true } });
  });

  it('user gets 404 for someone else’s pet', async () => {
    expectError(await c.user.delete('/pets/p_005'), 404, 'NOT_FOUND');
  });

  it('staff cannot delete pets (403)', async () => {
    expectError(await c.staff.delete('/pets/p_005'), 403, 'FORBIDDEN');
  });
});
