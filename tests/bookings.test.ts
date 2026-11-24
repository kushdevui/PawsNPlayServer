import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/db/seed.js';
import { UserModel } from '../src/modules/users/users.model.js';
import { expectError, ids, loginAll, type Clients } from './helpers.js';

/*
 * Seed bookings: b_001 confirmed (priya u_002, staff neha u_004) · b_002 pending (priya, no staff)
 * b_003 completed (rohan u_003, staff u_005) · b_004 confirmed (rohan, staff neha)
 * b_005 cancelled (priya, staff u_005) · b_006 pending (rohan, no staff)
 */
let c: Clients;

beforeEach(async () => {
  await seedDatabase();
  c = await loginAll();
});

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe('visibility', () => {
  it('admin sees all bookings, newest startTime first', async () => {
    const res = await c.admin.get('/bookings');
    expect(ids(res)).toEqual(['b_006', 'b_002', 'b_001', 'b_004', 'b_003', 'b_005']);
    expect(res.body.meta).toEqual({ total: 6, page: 1, limit: 20 });
  });

  it('user sees only their own bookings', async () => {
    expect(ids(await c.user.get('/bookings'))).toEqual(['b_002', 'b_001', 'b_005']);
  });

  it('staff sees only bookings assigned to them', async () => {
    expect(ids(await c.staff.get('/bookings'))).toEqual(['b_001', 'b_004']);
  });

  it('others’ bookings are 404, not 403', async () => {
    expectError(await c.user.get('/bookings/b_003'), 404, 'NOT_FOUND');
    expectError(await c.staff.get('/bookings/b_002'), 404, 'NOT_FOUND'); // unassigned
    expect((await c.staff.get('/bookings/b_004')).status).toBe(200);
    expect((await c.admin.get('/bookings/b_003')).status).toBe(200);
  });

  it('returns the exact Booking shape', async () => {
    const res = await c.user.get('/bookings/b_001');
    expect(res.body.data).toEqual({
      id: 'b_001',
      userId: 'u_002',
      petId: 'p_001',
      serviceId: 's_001',
      staffId: 'u_004',
      startTime: '2026-11-25T09:00:00.000Z',
      endTime: '2026-11-25T17:00:00.000Z',
      status: 'confirmed',
      notes: 'Please give lunch at 1pm.',
      totalPrice: 999,
      currency: 'INR',
      createdAt: '2026-11-20T08:15:00.000Z',
    });
  });

  it('requires a token', async () => {
    expectError(await c.anonymous.get('/bookings'), 401, 'UNAUTHORIZED');
  });
});

describe('GET /bookings filters', () => {
  it('filters by status', async () => {
    expect(ids(await c.admin.get('/bookings?status=pending'))).toEqual(['b_006', 'b_002']);
  });

  it('filters by from/to on startTime (inclusive)', async () => {
    const res = await c.admin.get('/bookings?from=2026-11-20&to=2026-11-25T09:00:00.000Z');
    expect(ids(res)).toEqual(['b_001', 'b_004']);
  });

  it('combines visibility and filters', async () => {
    expect(ids(await c.user.get('/bookings?status=cancelled'))).toEqual(['b_005']);
  });

  it('paginates', async () => {
    const res = await c.admin.get('/bookings?page=2&limit=4');
    expect(ids(res)).toEqual(['b_003', 'b_005']);
    expect(res.body.meta).toEqual({ total: 6, page: 2, limit: 4 });
  });

  it('rejects a bad status or date', async () => {
    expectError(await c.admin.get('/bookings?status=done'), 422, 'VALIDATION_ERROR');
    expectError(await c.admin.get('/bookings?from=yesterday'), 422, 'VALIDATION_ERROR');
  });
});

describe('POST /bookings', () => {
  it('user books: server sets endTime, price, currency, status and staff (201)', async () => {
    const startTime = inDays(3);
    const res = await c.user.post('/bookings', {
      petId: 'p_001',
      serviceId: 's_003',
      startTime,
      notes: 'First time',
      totalPrice: 1,
      status: 'confirmed',
      staffId: 'u_004',
      userId: 'u_003',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.stringMatching(/^b_[0-9a-f]{12}$/),
      userId: 'u_002',
      petId: 'p_001',
      serviceId: 's_003',
      staffId: null,
      startTime,
      endTime: new Date(new Date(startTime).getTime() + 60 * 60_000).toISOString(),
      status: 'pending',
      notes: 'First time',
      totalPrice: 399,
      currency: 'INR',
      createdAt: expect.any(String),
    });
  });

  it.each(['staff', 'admin'] as const)('%s cannot create bookings (403)', async (role) => {
    expectError(
      await c[role].post('/bookings', { petId: 'p_001', serviceId: 's_001', startTime: inDays(1) }),
      403,
      'FORBIDDEN',
    );
  });

  it.each([
    ['missing fields', {}, 'Pet, service and start time are required.'],
    ['someone else’s pet', { petId: 'p_003' }, 'Choose one of your pets.'],
    ['an unknown pet', { petId: 'p_999' }, 'Choose one of your pets.'],
    ['an inactive service', { serviceId: 's_005' }, 'Service is not available.'],
    ['an unknown service', { serviceId: 's_999' }, 'Service is not available.'],
    ['a species the service does not allow', { petId: 'p_002', serviceId: 's_003' }, 'Play Session is not available for cats.'],
    ['a past start time', { startTime: '2020-01-01T10:00:00.000Z' }, 'Pick a future date and time.'],
    ['an invalid start time', { startTime: 'tomorrow-ish' }, 'Pick a future date and time.'],
  ])('rejects %s with 422 VALIDATION_ERROR', async (label, override, message) => {
    const body = label === 'missing fields' ? {} : { petId: 'p_001', serviceId: 's_003', startTime: inDays(2), ...override };
    const res = await c.user.post('/bookings', body);
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.message).toBe(message);
  });
});

describe('PATCH /bookings/:id/status', () => {
  const setStatus = (who: keyof Clients, id: string, status?: string) =>
    c[who].patch(`/bookings/${id}/status`, status === undefined ? {} : { status });

  it('user cancels their own pending or confirmed booking', async () => {
    expect((await setStatus('user', 'b_002', 'cancelled')).body.data.status).toBe('cancelled');
    expect((await setStatus('user', 'b_001', 'cancelled')).body.data.status).toBe('cancelled');
  });

  it.each(['confirmed', 'completed', 'pending', 'bogus'])('user cannot set "%s" (403)', async (status) => {
    expectError(await setStatus('user', 'b_002', status), 403, 'FORBIDDEN');
  });

  it('user gets 404 for someone else’s booking', async () => {
    expectError(await setStatus('user', 'b_006', 'cancelled'), 404, 'NOT_FOUND');
  });

  it('staff completes an assigned confirmed booking', async () => {
    expect((await setStatus('staff', 'b_001', 'completed')).body.data.status).toBe('completed');
  });

  it.each(['confirmed', 'cancelled'])('staff cannot set "%s" (403)', async (status) => {
    expectError(await setStatus('staff', 'b_001', status), 403, 'FORBIDDEN');
  });

  it('staff gets 404 for a booking not assigned to them', async () => {
    expectError(await setStatus('staff', 'b_006', 'completed'), 404, 'NOT_FOUND');
  });

  it('only confirmed bookings can be completed (422 INVALID_STATE)', async () => {
    await c.admin.patch('/bookings/b_002/assign', { staffId: 'u_004' }).expect(200);
    expectError(await setStatus('staff', 'b_002', 'completed'), 422, 'INVALID_STATE');
    expectError(await setStatus('admin', 'b_006', 'completed'), 422, 'INVALID_STATE');
  });

  it('admin confirms, completes and cancels', async () => {
    expect((await setStatus('admin', 'b_006', 'confirmed')).body.data.status).toBe('confirmed');
    expect((await setStatus('admin', 'b_006', 'completed')).body.data.status).toBe('completed');
    expect((await setStatus('admin', 'b_002', 'cancelled')).body.data.status).toBe('cancelled');
  });

  it.each(['pending', 'bogus', undefined])('admin cannot set %s (403)', async (status) => {
    expectError(await setStatus('admin', 'b_002', status), 403, 'FORBIDDEN');
  });

  it.each([
    ['completed', 'b_003'],
    ['cancelled', 'b_005'],
  ])('%s bookings are final (422 INVALID_STATE)', async (_status, id) => {
    expectError(await setStatus('admin', id, 'cancelled'), 422, 'INVALID_STATE');
    expectError(await setStatus('admin', id, 'confirmed'), 422, 'INVALID_STATE');
  });

  it('checks the role before the state (like the mock)', async () => {
    expectError(await setStatus('user', 'b_005', 'confirmed'), 403, 'FORBIDDEN');
  });

  it('returns 404 for an unknown booking', async () => {
    expectError(await setStatus('admin', 'b_999', 'confirmed'), 404, 'NOT_FOUND');
  });
});

describe('PATCH /bookings/:id/assign', () => {
  it('admin assigns an active staff member; the staff member then sees it', async () => {
    const res = await c.admin.patch('/bookings/b_002/assign', { staffId: 'u_004' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'b_002', staffId: 'u_004', status: 'pending' });
    expect(ids(await c.staff.get('/bookings'))).toContain('b_002');
  });

  it.each([
    ['a user (not staff)', 'u_002'],
    ['an admin', 'u_001'],
    ['an unknown id', 'u_999'],
    ['nothing', undefined],
  ])('rejects %s with 422 VALIDATION_ERROR', async (_label, staffId) => {
    const res = await c.admin.patch('/bookings/b_002/assign', staffId === undefined ? {} : { staffId });
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Choose an active staff member.');
  });

  it('rejects an inactive staff member', async () => {
    await UserModel.updateOne({ _id: 'u_005' }, { status: 'inactive' });
    expectError(await c.admin.patch('/bookings/b_002/assign', { staffId: 'u_005' }), 422, 'VALIDATION_ERROR');
  });

  it('returns 404 for an unknown booking', async () => {
    expectError(await c.admin.patch('/bookings/b_999/assign', { staffId: 'u_004' }), 404, 'NOT_FOUND');
  });

  it.each(['user', 'staff'] as const)('%s cannot assign (403)', async (role) => {
    expectError(await c[role].patch('/bookings/b_002/assign', { staffId: 'u_004' }), 403, 'FORBIDDEN');
  });
});
