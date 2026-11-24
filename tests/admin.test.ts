import { beforeEach, describe, expect, it } from 'vitest';
import { expectError, ids, seededWorld, type Clients } from './helpers.js';

/** "Now" is pinned to 2026-11-23 19:30 IST by seededWorld() (spec §11). */
let c: Clients;
let id: (mockId: string) => string;

beforeEach(async () => {
  ({ c, id } = await seededWorld());
});

describe('GET /admin/dashboard', () => {
  it('matches the §11 numbers for the seed data', async () => {
    const res = await c.admin.get('/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      capacity: 15,
      occupiedNow: 7,
      availableNow: 8,
      activeDogs: 12,
      bookingsThisMonth: 12,
      paymentsDue: 57000,
      paymentsDueBookings: 12,
    });
  });

  it("lists today's check-ins/check-outs, the next 7 days and occupancy per day", async () => {
    const { data } = (await c.staff.get('/admin/dashboard')).body;
    expect(data.todayCheckIns.map((b: { id: string }) => b.id)).toEqual([id('b_010'), id('b_011')]);
    expect(data.todayCheckOuts.map((b: { id: string }) => b.id)).toEqual([id('b_008')]);
    expect(data.upcoming.map((b: { id: string }) => b.id)).toEqual([id('b_011'), id('b_012'), id('b_013'), id('b_014')]);
    expect(data.upcoming[0]).toMatchObject({ dog: { name: 'Bruno' }, paymentStatus: 'partial' });
    expect(data.occupancyNext7Days).toHaveLength(7);
    expect(data.occupancyNext7Days[0]).toEqual({ date: '2026-11-23', count: 7 });
    expect(data.occupancyNext7Days[6].date).toBe('2026-11-29');
  });

  it('user role -> 403', async () => {
    expectError(await c.user.get('/admin/dashboard'), 403, 'FORBIDDEN');
  });
});

describe('GET /admin/occupancy', () => {
  it('2026-11-01..2026-12-01 -> 30 days; 23 Nov occupied 7, available 8, checkIns 2, checkOuts 1', async () => {
    const res = await c.staff.get('/admin/occupancy?from=2026-11-01&to=2026-12-01');
    expect(res.status).toBe(200);
    expect(res.body.data.capacity).toBe(15);
    expect(res.body.data.days).toHaveLength(30);
    expect(res.body.data.days[0].date).toBe('2026-11-01');
    expect(res.body.data.days[29].date).toBe('2026-11-30');
    const nov23 = res.body.data.days.find((d: { date: string }) => d.date === '2026-11-23');
    expect(nov23).toEqual({ date: '2026-11-23', occupied: 7, available: 8, checkIns: 2, checkOuts: 1 });
  });

  it('cancelled stays are never counted; past days count checked-out stays', async () => {
    const { days } = (await c.admin.get('/admin/occupancy?from=2026-11-01&to=2026-11-15')).body.data;
    const byDate = Object.fromEntries(days.map((d: { date: string }) => [d.date, d]));
    expect(byDate['2026-11-10']).toEqual({ date: '2026-11-10', occupied: 0, available: 15, checkIns: 0, checkOuts: 0 }); // b_003 cancelled
    expect(byDate['2026-11-03']).toMatchObject({ occupied: 1 }); // b_002, checked out (history)
    expect(byDate['2026-11-02']).toMatchObject({ checkIns: 1 });
  });

  it('invalid range -> 422 with the spec message; ranges over 62 days are cut', async () => {
    const message = 'from and to must be YYYY-MM-DD with to after from.';
    expectError(await c.admin.get('/admin/occupancy?from=2026-11-10&to=2026-11-10'), 422, 'VALIDATION_ERROR', message);
    expectError(await c.admin.get('/admin/occupancy?from=2026-13-01&to=2026-12-01'), 422, 'VALIDATION_ERROR', message);
    expectError(await c.admin.get('/admin/occupancy'), 422, 'VALIDATION_ERROR', message);
    expect((await c.admin.get('/admin/occupancy?from=2026-01-01&to=2026-12-31')).body.data.days).toHaveLength(62);
  });
});

describe('GET /admin/billing', () => {
  it('November (IST month) matches §11', async () => {
    const from = '2026-10-31T18:30:00.000Z';
    const to = '2026-11-30T18:30:00.000Z';
    const res = await c.admin.get(`/admin/billing?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      from,
      to,
      currency: 'INR',
      bookings: 12,
      expected: 68400,
      received: 30800,
      due: 37600,
      advances: 28400,
      paidCount: 3,
      partialCount: 6,
      unpaidCount: 3,
      outstandingAllTime: 57000,
      outstandingBookings: 12,
      collected: 34200,
      collectedCount: 13,
    });
  });

  it('week Mon 23 Nov - Mon 30 Nov -> bookings 5, expected 26400', async () => {
    const res = await c.admin.get('/admin/billing?from=2026-11-22T18:30:00.000Z&to=2026-11-29T18:30:00.000Z');
    expect(res.body.data).toMatchObject({ bookings: 5, expected: 26400 });
  });

  it('without from/to: all time, from/to echoed as null', async () => {
    const res = await c.admin.get('/admin/billing');
    expect(res.body.data).toMatchObject({ from: null, to: null, bookings: 16 });
  });

  it('staff -> 403 (billing is admin only); bad date -> 422', async () => {
    expectError(await c.staff.get('/admin/billing'), 403, 'FORBIDDEN');
    expectError(await c.admin.get('/admin/billing?from=yesterday'), 422, 'VALIDATION_ERROR');
  });
});

describe('dashboard with real bookings', () => {
  it('checking a dog in updates occupiedNow', async () => {
    await c.admin.patch(`/bookings/${id('b_011')}/status`, { status: 'checked_in' }).expect(200);
    expect((await c.admin.get('/admin/dashboard')).body.data).toMatchObject({ occupiedNow: 8, availableNow: 7 });
    expect(ids(await c.admin.get('/bookings?status=checked_in'))).toContain(id('b_011'));
  });
});
