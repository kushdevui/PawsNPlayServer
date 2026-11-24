import { beforeEach, describe, expect, it } from 'vitest';
import { BookingModel } from '../src/modules/bookings/bookings.model.js';
import { peakFor } from '../src/modules/bookings/bookings.service.js';
import { expectError, ids, seededWorld, type Clients } from './helpers.js';

let c: Clients;
let id: (mockId: string) => string;

beforeEach(async () => {
  ({ c, id } = await seededWorld());
});

/** IST wall-clock time -> ISO UTC (IST = UTC+05:30). */
const ist = (local: string) => new Date(`${local}:00.000+05:30`).toISOString();

const createStay = (dog: string, checkIn: string, checkOut: string, extra: object = {}) =>
  c.admin.post('/bookings', { dogId: id(dog), checkIn: ist(checkIn), checkOut: ist(checkOut), ...extra });

describe('GET /bookings', () => {
  it('admin and staff can read; sorted by checkIn; each item has dog + derived money fields', async () => {
    const res = await c.staff.get('/bookings');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 17, page: 1, limit: 50 });
    const checkIns = (res.body.data as Array<{ checkIn: string }>).map((b) => b.checkIn);
    expect(checkIns).toEqual([...checkIns].sort());

    const b004 = (res.body.data as Array<{ id: string }>).find((b) => b.id === id('b_004'));
    expect(b004).toEqual({
      id: id('b_004'),
      dogId: id('d_002'),
      dog: { id: id('d_002'), name: 'Simba', breed: 'Golden Retriever', ownerName: 'Rohan Mehta', ownerPhone: '+91 98100 00003' },
      checkIn: '2026-11-19T04:30:00.000Z',
      checkOut: '2026-11-26T12:30:00.000Z',
      status: 'checked_in',
      kennel: 'K-02',
      nights: 7,
      pricePerNight: 1200,
      totalAmount: 8400,
      currency: 'INR',
      notes: "Pick-up by owner's brother.",
      source: 'admin',
      createdBy: id('u_001'),
      createdAt: '2026-10-01T03:30:00.000Z',
      updatedAt: '2026-10-01T03:30:00.000Z',
      payments: [
        {
          id: id('p_007'),
          amount: 3000,
          type: 'advance',
          method: 'upi',
          note: 'Advance',
          receivedAt: '2026-11-16T04:30:00.000Z',
          recordedBy: id('u_001'),
        },
      ],
      amountPaid: 3000,
      balanceDue: 5400,
      paymentStatus: 'partial',
    });
  });

  it('from/to returns overlapping stays: a 28 Nov - 2 Dec stay is in both November and December', async () => {
    const nov = ids(await c.admin.get(`/bookings?from=${ist('2026-11-01T00:00')}&to=${ist('2026-12-01T00:00')}`));
    const dec = ids(await c.admin.get(`/bookings?from=${ist('2026-12-01T00:00')}&to=${ist('2027-01-01T00:00')}`));
    expect(nov).toContain(id('b_014'));
    expect(dec).toContain(id('b_014'));
    expect(nov).not.toContain(id('b_001')); // October stay
  });

  it('?paymentStatus=due returns only balanceDue > 0', async () => {
    const res = await c.admin.get('/bookings?paymentStatus=due');
    expect(res.body.data.length).toBe(12);
    expect((res.body.data as Array<{ balanceDue: number }>).every((b) => b.balanceDue > 0)).toBe(true);
  });

  it('filters by status, paymentStatus and dogId (full dog history)', async () => {
    expect(ids(await c.admin.get('/bookings?status=cancelled'))).toEqual([id('b_003')]);
    expect(ids(await c.admin.get('/bookings?paymentStatus=paid')).length).toBeGreaterThan(0);
    expect(ids(await c.admin.get(`/bookings?dogId=${id('d_001')}`))).toEqual([id('b_001'), id('b_011')]);
  });

  it('404 "Booking not found"; user role 403', async () => {
    expectError(await c.admin.get('/bookings/0123456789abcdef01234567'), 404, 'NOT_FOUND', 'Booking not found');
    expectError(await c.user.get('/bookings'), 403, 'FORBIDDEN');
  });
});

describe('POST /bookings (spec §11 Bookings)', () => {
  it('10 Dec 10:00 -> 13 Dec 18:00 at 1200 -> 201, nights 3, total 3600, confirmed, unpaid', async () => {
    const res = await createStay('d_009', '2026-12-10T10:00', '2026-12-13T18:00', {
      pricePerNight: 1200,
      kennel: 'K-04',
      nights: 99,
      totalAmount: 1,
      status: 'checked_out',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      dogId: id('d_009'),
      dog: { id: id('d_009'), name: 'Bella' },
      checkIn: '2026-12-10T04:30:00.000Z',
      checkOut: '2026-12-13T12:30:00.000Z',
      status: 'confirmed',
      kennel: 'K-04',
      nights: 3,
      pricePerNight: 1200,
      totalAmount: 3600,
      currency: 'INR',
      source: 'admin',
      createdBy: id('u_001'),
      payments: [],
      amountPaid: 0,
      balanceDue: 3600,
      paymentStatus: 'unpaid',
    });
  });

  it('defaults pricePerNight to settings and computes nights in IST (same-day 08:30 -> 18:00 = 1 night)', async () => {
    const res = await createStay('d_004', '2026-11-30T08:30', '2026-11-30T18:00');
    expect(res.body.data).toMatchObject({ nights: 1, pricePerNight: 1200, totalAmount: 1200 });
  });

  it('same dog overlapping 12-14 Dec -> 422 DOG_ALREADY_BOOKED with details.bookingId', async () => {
    const first = await createStay('d_009', '2026-12-10T10:00', '2026-12-13T18:00');
    expectError(
      await createStay('d_009', '2026-12-12T10:00', '2026-12-14T18:00'),
      422,
      'DOG_ALREADY_BOOKED',
      'Bella already has a booking in these dates.',
      { bookingId: first.body.data.id },
    );
  });

  it('validation order and messages', async () => {
    expectError(await c.admin.post('/bookings', {}), 422, 'VALIDATION_ERROR', 'Choose a dog.');
    await c.admin.patch(`/bookings/${id('b_008')}/status`, { status: 'checked_out' });
    await c.admin.patch(`/dogs/${id('d_010')}`, { status: 'archived' }).expect(200);
    expectError(await createStay('d_010', '2026-12-10T10:00', '2026-12-11T10:00'), 422, 'VALIDATION_ERROR', 'Oscar is archived.');
    expectError(
      await c.admin.post('/bookings', { dogId: id('d_009'), checkIn: 'soon', checkOut: ist('2026-12-11T10:00') }),
      422,
      'VALIDATION_ERROR',
      'Enter check-in and check-out date and time.',
    );
    expectError(
      await createStay('d_009', '2026-12-11T10:00', '2026-12-11T10:00'),
      422,
      'VALIDATION_ERROR',
      'Check-out must be after check-in.',
    );
    expectError(
      await createStay('d_009', '2026-12-10T10:00', '2026-12-11T10:00', { pricePerNight: -5 }),
      422,
      'VALIDATION_ERROR',
      'Price per night must be a positive number.',
    );
  });

  it('fill capacity: capacity = current peak for a window, one more stay -> 422 CAPACITY_FULL { peak, capacity }', async () => {
    const start = new Date(ist('2026-11-24T10:00'));
    const end = new Date(ist('2026-11-25T10:00'));
    const peak = await peakFor(start, end);
    expect(peak).toBeGreaterThanOrEqual(7); // capacity cannot go below the 7 dogs checked in
    await c.admin.patch('/settings', { capacity: peak }).expect(200);

    expectError(
      await createStay('d_004', '2026-11-24T10:00', '2026-11-25T10:00'),
      422,
      'CAPACITY_FULL',
      `Boarding is full (${peak} dogs) for part of these dates.`,
      { peak, capacity: peak },
    );
  });

  it('back-to-back same-day stays (A leaves 11:00, B arrives 20:00) with capacity 1 -> both allowed', async () => {
    await BookingModel.deleteMany({});
    await c.admin.patch('/settings', { capacity: 1 }).expect(200);
    expect((await createStay('d_001', '2026-12-01T10:00', '2026-12-03T11:00')).status).toBe(201);
    expect((await createStay('d_002', '2026-12-03T20:00', '2026-12-05T18:00')).status).toBe(201);
    expectError(await createStay('d_003', '2026-12-03T10:00', '2026-12-03T21:00'), 422, 'CAPACITY_FULL');
  });

  it('staff and user cannot create', async () => {
    expectError(await c.staff.post('/bookings', {}), 403, 'FORBIDDEN');
    expectError(await c.user.post('/bookings', {}), 403, 'FORBIDDEN');
  });
});

describe('PATCH /bookings/:id/status', () => {
  it('confirmed -> checked_in -> checked_out (staff can do it); then edit -> 422', async () => {
    const created = await createStay('d_009', '2026-12-10T10:00', '2026-12-13T18:00');
    const bookingId = created.body.data.id as string;
    expect((await c.staff.patch(`/bookings/${bookingId}/status`, { status: 'checked_in' })).body.data.status).toBe('checked_in');
    expect((await c.staff.patch(`/bookings/${bookingId}/status`, { status: 'checked_out' })).body.data.status).toBe('checked_out');
    expectError(
      await c.admin.patch(`/bookings/${bookingId}`, { notes: 'late' }),
      422,
      'INVALID_STATE',
      'Booking is already checked out.',
    );
  });

  it('checked_in -> cancelled -> 422 INVALID_STATE', async () => {
    expectError(
      await c.admin.patch(`/bookings/${id('b_004')}/status`, { status: 'cancelled' }),
      422,
      'INVALID_STATE',
      'Cannot change a checked in booking to cancelled.',
    );
  });

  it('cancelled is final; unknown target -> INVALID_STATE', async () => {
    expectError(await c.admin.patch(`/bookings/${id('b_003')}/status`, { status: 'confirmed' }), 422, 'INVALID_STATE');
    expectError(await c.admin.patch(`/bookings/${id('b_012')}/status`, { status: 'done' }), 422, 'INVALID_STATE');
  });

  it('check-in when checked-in count >= capacity -> 422 CAPACITY_FULL', async () => {
    await c.admin.patch('/settings', { capacity: 7 }).expect(200);
    expectError(
      await c.admin.patch(`/bookings/${id('b_011')}/status`, { status: 'checked_in' }),
      422,
      'CAPACITY_FULL',
      'Boarding is full (7 dogs checked in).',
    );
  });

  it('user role cannot change status', async () => {
    expectError(await c.user.patch(`/bookings/${id('b_012')}/status`, { status: 'cancelled' }), 403, 'FORBIDDEN');
  });
});

describe('PATCH /bookings/:id', () => {
  it('changing the dog after check-in -> 422 "Cannot change the dog after check-in."', async () => {
    expectError(
      await c.admin.patch(`/bookings/${id('b_004')}`, { dogId: id('d_003') }),
      422,
      'INVALID_STATE',
      'Cannot change the dog after check-in.',
    );
  });

  it('edits dates/price/kennel, recomputes nights and total, ignores itself in overlap checks', async () => {
    const res = await c.admin.patch(`/bookings/${id('b_012')}`, {
      checkOut: ist('2026-11-29T18:00'),
      pricePerNight: 1000,
      kennel: '',
      notes: 'Extended',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ nights: 5, pricePerNight: 1000, totalAmount: 5000, kennel: null, notes: 'Extended' });
  });

  it('may become overpaid when the total drops below what was paid', async () => {
    // b_011: 7200 total, 3000 advance. 1 night at 1200 -> overpaid.
    const res = await c.admin.patch(`/bookings/${id('b_011')}`, { checkOut: ist('2026-11-24T18:00') });
    expect(res.body.data).toMatchObject({ nights: 1, totalAmount: 1200, balanceDue: -1800, paymentStatus: 'overpaid' });
  });

  it('cancelled booking -> 422 "Booking is already cancelled."; staff -> 403', async () => {
    expectError(await c.admin.patch(`/bookings/${id('b_003')}`, { notes: 'x' }), 422, 'INVALID_STATE', 'Booking is already cancelled.');
    expectError(await c.staff.patch(`/bookings/${id('b_012')}`, { notes: 'x' }), 403, 'FORBIDDEN');
  });

  it('no DELETE for bookings (405)', async () => {
    expectError(await c.admin.delete(`/bookings/${id('b_012')}`), 405, 'METHOD_NOT_ALLOWED');
  });
});
