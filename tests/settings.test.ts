import { beforeEach, describe, expect, it } from 'vitest';
import { expectError, seededWorld, type Clients } from './helpers.js';

let c: Clients;

beforeEach(async () => {
  ({ c } = await seededWorld());
});

describe('GET /settings', () => {
  it.each(['admin', 'staff'] as const)('%s gets exactly the settings fields', async (role) => {
    const res = await c[role].get('/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        facilityName: "Paws N' Play Boarding",
        capacity: 15,
        defaultCheckInTime: '10:00',
        defaultCheckOutTime: '18:00',
        pricePerNight: 1200,
        currency: 'INR',
        timezone: 'Asia/Kolkata',
      },
    });
  });

  it('user role -> 403', async () => {
    expectError(await c.user.get('/settings'), 403, 'FORBIDDEN');
  });
});

describe('PATCH /settings (spec §11 Settings / capacity)', () => {
  it('capacity 5 while 7 checked in -> 422 CAPACITY_BELOW_OCCUPANCY (details.checkedIn 7)', async () => {
    expectError(
      await c.admin.patch('/settings', { capacity: 5 }),
      422,
      'CAPACITY_BELOW_OCCUPANCY',
      "7 dogs are checked in right now. Capacity can't be lower than that.",
      { checkedIn: 7 },
    );
  });

  it('capacity 20 -> 200 and dashboard availableNow updates', async () => {
    const res = await c.admin.patch('/settings', { capacity: 20 });
    expect(res.status).toBe(200);
    expect(res.body.data.capacity).toBe(20);
    const dashboard = await c.admin.get('/admin/dashboard');
    expect(dashboard.body.data).toMatchObject({ capacity: 20, occupiedNow: 7, availableNow: 13 });
  });

  it('defaultCheckInTime "25:00" -> 422', async () => {
    expectError(await c.admin.patch('/settings', { defaultCheckInTime: '25:00' }), 422, 'VALIDATION_ERROR', 'Check-in time must be HH:mm.');
    expectError(await c.admin.patch('/settings', { defaultCheckOutTime: '6pm' }), 422, 'VALIDATION_ERROR', 'Check-out time must be HH:mm.');
  });

  it.each([0, 501, 7.5, '20'])('capacity %s -> 422 whole number message', async (capacity) => {
    expectError(
      await c.admin.patch('/settings', { capacity }),
      422,
      'VALIDATION_ERROR',
      'Capacity must be a whole number between 1 and 500.',
    );
  });

  it('price, facility name and read-only fields', async () => {
    expectError(await c.admin.patch('/settings', { pricePerNight: -1 }), 422, 'VALIDATION_ERROR', 'Price per night must be 0 or more.');
    expectError(await c.admin.patch('/settings', { facilityName: '  ' }), 422, 'VALIDATION_ERROR', 'Facility name is required.');

    const res = await c.admin.patch('/settings', {
      pricePerNight: 1500,
      defaultCheckInTime: '09:30',
      facilityName: ' Paws HQ ',
      currency: 'USD',
      timezone: 'UTC',
    });
    expect(res.body.data).toMatchObject({
      pricePerNight: 1500,
      defaultCheckInTime: '09:30',
      facilityName: 'Paws HQ',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    });
  });

  it('staff cannot change settings', async () => {
    expectError(await c.staff.patch('/settings', { capacity: 20 }), 403, 'FORBIDDEN');
  });
});
