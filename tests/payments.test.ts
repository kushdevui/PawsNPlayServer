import { beforeEach, describe, expect, it } from 'vitest';
import { expectError, seededWorld, type Clients } from './helpers.js';

let c: Clients;
let bookingId: string;

beforeEach(async () => {
  const world = await seededWorld();
  c = world.c;
  // A fresh 3600 booking: Bella, 10 Dec 10:00 -> 13 Dec 18:00 IST at 1200.
  const res = await c.admin.post('/bookings', {
    dogId: world.id('d_009'),
    checkIn: '2026-12-10T04:30:00.000Z',
    checkOut: '2026-12-13T12:30:00.000Z',
    pricePerNight: 1200,
  });
  expect(res.body.data.totalAmount).toBe(3600);
  bookingId = res.body.data.id;
});

const pay = (body: object) => c.admin.post(`/bookings/${bookingId}/payments`, body);

describe('POST /bookings/:id/payments (spec §11 Payments)', () => {
  it('advance 1800 on a 3600 booking -> 201, amountPaid 1800, balanceDue 1800, partial', async () => {
    const res = await pay({ amount: 1800, type: 'advance', method: 'upi', note: ' 50% ', receivedAt: '2026-11-24T05:00:00.000Z' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: bookingId, amountPaid: 1800, balanceDue: 1800, paymentStatus: 'partial' });
    expect(res.body.data.payments).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        amount: 1800,
        type: 'advance',
        method: 'upi',
        note: '50%',
        receivedAt: '2026-11-24T05:00:00.000Z',
        recordedBy: expect.stringMatching(/^[0-9a-f]{24}$/),
      },
    ]);
  });

  it('payment 5000 -> 422 OVERPAYMENT (details.balanceDue 1800); payment 1800 -> paid', async () => {
    await pay({ amount: 1800, type: 'advance', method: 'upi' }).expect(201);
    expectError(await pay({ amount: 5000 }), 422, 'OVERPAYMENT', 'Only ₹1800 is due on this booking.', { balanceDue: 1800 });
    const res = await pay({ amount: 1800 });
    expect(res.body.data).toMatchObject({ amountPaid: 3600, balanceDue: 0, paymentStatus: 'paid' });
    expect(res.body.data.payments[1]).toMatchObject({ type: 'payment', method: 'cash', note: '' }); // defaults
  });

  it('refund larger than amountPaid -> 422', async () => {
    await pay({ amount: 1000 }).expect(201);
    expectError(await pay({ amount: 1500, type: 'refund' }), 422, 'VALIDATION_ERROR', "Refund can't be more than the ₹1000 received.");
  });

  it('payment on a cancelled booking -> 422 INVALID_STATE; refund allowed', async () => {
    await pay({ amount: 1000, type: 'advance' }).expect(201);
    await c.admin.patch(`/bookings/${bookingId}/status`, { status: 'cancelled' }).expect(200);
    expectError(await pay({ amount: 100 }), 422, 'INVALID_STATE', 'This booking is cancelled - record a refund instead.');

    const refund = await pay({ amount: 1000, type: 'refund', method: 'bank' });
    expect(refund.status).toBe(201);
    expect(refund.body.data).toMatchObject({ amountPaid: 0, balanceDue: 0, paymentStatus: 'paid' });
  });

  it('validation messages', async () => {
    expectError(await pay({ amount: 0 }), 422, 'VALIDATION_ERROR', 'Enter an amount above 0.');
    expectError(await pay({ amount: 10, type: 'tip' }), 422, 'VALIDATION_ERROR', 'Invalid payment type.');
    expectError(await pay({ amount: 10, method: 'cheque' }), 422, 'VALIDATION_ERROR', 'Invalid payment method.');
    expectError(await pay({ amount: 10, receivedAt: 'yesterday' }), 422, 'VALIDATION_ERROR', 'Invalid payment date.');
  });

  it('staff cannot record payments; unknown booking -> 404', async () => {
    expectError(await c.staff.post(`/bookings/${bookingId}/payments`, { amount: 10 }), 403, 'FORBIDDEN');
    expectError(await c.admin.post('/bookings/0123456789abcdef01234567/payments', { amount: 10 }), 404, 'NOT_FOUND', 'Booking not found');
  });
});

describe('DELETE /bookings/:id/payments/:paymentId', () => {
  it('removes the payment and recomputes totals', async () => {
    const added = await pay({ amount: 1800, type: 'advance' });
    const paymentId = added.body.data.payments[0].id as string;
    const res = await c.admin.delete(`/bookings/${bookingId}/payments/${paymentId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ payments: [], amountPaid: 0, balanceDue: 3600, paymentStatus: 'unpaid' });
  });

  it('404 "Payment not found" / "Booking not found"', async () => {
    expectError(await c.admin.delete(`/bookings/${bookingId}/payments/0123456789abcdef01234567`), 404, 'NOT_FOUND', 'Payment not found');
    expectError(await c.admin.delete('/bookings/0123456789abcdef01234567/payments/x'), 404, 'NOT_FOUND', 'Booking not found');
  });
});
