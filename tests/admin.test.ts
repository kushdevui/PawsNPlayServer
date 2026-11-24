import { beforeEach, describe, expect, it } from 'vitest';
import { loadSeedFile, seedDatabase } from '../src/db/seed.js';
import { getDashboard } from '../src/modules/admin/admin.service.js';
import { BookingModel } from '../src/modules/bookings/bookings.model.js';
import { expectError, loginAll, type Clients } from './helpers.js';

let c: Clients;

beforeEach(async () => {
  await seedDatabase();
  c = await loginAll();
});

const bookingIds = (list: Array<{ id: string }>) => list.map((b) => b.id);

describe('GET /admin/dashboard', () => {
  it('returns the DashboardStats computed from the data', async () => {
    const res = await c.admin.get('/admin/dashboard');

    // Upcoming depends on the current time, so compute the expectation from the seed like the mock does.
    const now = new Date().toISOString();
    const expectedUpcoming = (await loadSeedFile('bookings'))
      .filter((b) => String(b.startTime) >= now && (b.status === 'pending' || b.status === 'confirmed'))
      .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
      .slice(0, 5)
      .map((b) => b.id);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalUsers: 3, // role user only (includes the inactive one)
      totalStaff: 2,
      totalPets: 5,
      bookingsByStatus: { pending: 2, confirmed: 2, completed: 1, cancelled: 1 },
      revenue: { amount: 399, currency: 'INR' },
      upcomingBookings: expect.any(Array),
    });
    expect(bookingIds(res.body.data.upcomingBookings)).toEqual(expectedUpcoming);
  });

  it.each(['user', 'staff'] as const)('%s gets 403 FORBIDDEN', async (role) => {
    expectError(await c[role].get('/admin/dashboard'), 403, 'FORBIDDEN');
  });

  it('requires a token', async () => {
    expectError(await c.anonymous.get('/admin/dashboard'), 401, 'UNAUTHORIZED');
  });
});

describe('getDashboard (fixed clock)', () => {
  it('lists the next pending/confirmed bookings, soonest first, max 5', async () => {
    const stats = await getDashboard(new Date('2026-11-24T00:00:00.000Z'));
    expect(stats.upcomingBookings.map((b) => b._id)).toEqual(['b_004', 'b_001', 'b_002', 'b_006']);
  });

  it('caps upcoming bookings at 5', async () => {
    const stats = await getDashboard(new Date('2026-01-01T00:00:00.000Z'));
    expect(stats.upcomingBookings).toHaveLength(4); // only 4 pending/confirmed in the seed
    await BookingModel.create({
      userId: 'u_002', petId: 'p_001', serviceId: 's_001', startTime: new Date('2026-12-01T09:00:00Z'),
      endTime: new Date('2026-12-01T17:00:00Z'), status: 'pending', totalPrice: 999,
    });
    await BookingModel.create({
      userId: 'u_002', petId: 'p_001', serviceId: 's_001', startTime: new Date('2026-12-02T09:00:00Z'),
      endTime: new Date('2026-12-02T17:00:00Z'), status: 'confirmed', totalPrice: 999,
    });
    expect((await getDashboard(new Date('2026-01-01T00:00:00.000Z'))).upcomingBookings).toHaveLength(5);
  });

  it('always reports all four statuses and zero revenue when there are no bookings', async () => {
    await BookingModel.deleteMany({});
    const stats = await getDashboard();
    expect(stats.bookingsByStatus).toEqual({ pending: 0, confirmed: 0, completed: 0, cancelled: 0 });
    expect(stats.revenue).toEqual({ amount: 0, currency: 'INR' });
    expect(stats.upcomingBookings).toEqual([]);
  });

  it('sums totalPrice of completed bookings only', async () => {
    await BookingModel.updateOne({ _id: 'b_001' }, { status: 'completed' }); // +999
    expect((await getDashboard()).revenue.amount).toBe(399 + 999);
  });
});
