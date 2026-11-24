import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/db/seed.js';
import { expectError, ids, loginAll, type Clients } from './helpers.js';

let c: Clients;

beforeEach(async () => {
  await seedDatabase();
  c = await loginAll();
});

describe('GET /notifications', () => {
  it('returns only the caller’s notifications, newest first', async () => {
    const res = await c.user.get('/notifications');
    expect(ids(res)).toEqual(['n_001', 'n_002']);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20 });
  });

  it.each([
    ['staff', ['n_004']],
    ['admin', ['n_005']],
    ['otherUser', ['n_003']],
  ] as const)('%s only sees their own', async (who, expected) => {
    expect(ids(await c[who].get('/notifications'))).toEqual(expected);
  });

  it('filters unread=true / unread=false', async () => {
    expect(ids(await c.user.get('/notifications?unread=true'))).toEqual(['n_001']);
    expect(ids(await c.user.get('/notifications?unread=false'))).toEqual(['n_002']);
  });

  it('rejects other unread values', async () => {
    expectError(await c.user.get('/notifications?unread=maybe'), 422, 'VALIDATION_ERROR');
  });

  it('returns the exact AppNotification shape', async () => {
    const [first] = (await c.user.get('/notifications')).body.data;
    expect(first).toEqual({
      id: 'n_001',
      userId: 'u_002',
      type: 'booking',
      title: 'Booking confirmed',
      body: 'Bruno\'s Day Care on 25 Nov is confirmed.',
      read: false,
      data: { bookingId: 'b_001' },
      createdAt: '2026-11-21T09:00:00.000Z',
    });
  });

  it('requires a token', async () => {
    expectError(await c.anonymous.get('/notifications'), 401, 'UNAUTHORIZED');
  });
});

describe('PATCH /notifications/:id/read', () => {
  it('marks the caller’s notification as read', async () => {
    const res = await c.user.patch('/notifications/n_001/read');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'n_001', read: true });
    expect(ids(await c.user.get('/notifications?unread=true'))).toEqual([]);
  });

  it('is a no-op for an already read notification', async () => {
    expect((await c.user.patch('/notifications/n_002/read')).body.data.read).toBe(true);
  });

  it('returns 404 for someone else’s notification', async () => {
    expectError(await c.user.patch('/notifications/n_003/read'), 404, 'NOT_FOUND');
    expectError(await c.admin.patch('/notifications/n_001/read'), 404, 'NOT_FOUND');
  });

  it('returns 404 for an unknown id', async () => {
    expectError(await c.user.patch('/notifications/n_999/read'), 404, 'NOT_FOUND');
  });
});
