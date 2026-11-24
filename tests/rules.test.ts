import { describe, expect, it } from 'vitest';
import { paymentTotals, peakOccupancy, type Stay } from '../src/modules/bookings/bookings.rules.js';
import { localDateKey, nightsBetween, parseDateKey } from '../src/utils/time.js';

const TZ = 'Asia/Kolkata';
const ist = (local: string) => new Date(`${local}:00.000+05:30`);
const stay = (id: string, from: string, to: string, status: Stay['status'] = 'confirmed'): Stay => ({
  id,
  checkIn: ist(from),
  checkOut: ist(to),
  status,
});

describe('nights (spec §8.3, facility timezone)', () => {
  it('25 Nov 10:00 -> 28 Nov 18:00 = 3; same day = 1 (minimum)', () => {
    expect(nightsBetween(ist('2026-11-25T10:00'), ist('2026-11-28T18:00'), TZ)).toBe(3);
    expect(nightsBetween(ist('2026-11-23T08:30'), ist('2026-11-23T18:00'), TZ)).toBe(1);
  });

  it('counts IST calendar days, not UTC ones', () => {
    // 23 Nov 23:30 IST -> 24 Nov 01:00 IST is 1 night even though both are 23 Nov in UTC.
    expect(nightsBetween(ist('2026-11-23T23:30'), ist('2026-11-24T01:00'), TZ)).toBe(1);
    expect(localDateKey(ist('2026-11-24T01:00'), TZ)).toBe('2026-11-24');
  });

  it('parseDateKey rejects impossible dates', () => {
    expect(parseDateKey('2026-02-30', TZ)).toBeNull();
    expect(parseDateKey('2026-11-23', TZ)?.toISOString()).toBe('2026-11-22T18:30:00.000Z');
  });
});

describe('peakOccupancy (spec §8.2)', () => {
  it('a dog leaving at 11:00 and another arriving at 20:00 do not count at the same time', () => {
    const stays = [stay('a', '2026-11-22T10:00', '2026-11-23T11:00'), stay('b', '2026-11-23T20:00', '2026-11-25T10:00')];
    expect(peakOccupancy(stays, ist('2026-11-23T00:00'), ist('2026-11-24T00:00'), ['confirmed'])).toBe(1);
  });

  it('counts overlapping stays, ignores one id and statuses not listed', () => {
    const stays = [
      stay('a', '2026-11-22T10:00', '2026-11-26T11:00'),
      stay('b', '2026-11-23T09:00', '2026-11-24T10:00', 'checked_in'),
      stay('c', '2026-11-23T12:00', '2026-11-25T10:00', 'cancelled'),
    ];
    const window: [Date, Date] = [ist('2026-11-23T00:00'), ist('2026-11-24T00:00')];
    expect(peakOccupancy(stays, ...window, ['confirmed', 'checked_in'])).toBe(2);
    expect(peakOccupancy(stays, ...window, ['confirmed', 'checked_in'], 'b')).toBe(1);
    expect(peakOccupancy([], ...window, ['confirmed'])).toBe(0);
  });
});

describe('paymentTotals (spec §8.5)', () => {
  const total = { status: 'confirmed' as const, totalAmount: 3600 };
  it('unpaid / partial / paid / overpaid', () => {
    expect(paymentTotals(total, [])).toEqual({ amountPaid: 0, balanceDue: 3600, paymentStatus: 'unpaid' });
    expect(paymentTotals(total, [{ amount: 1800, type: 'advance' }])).toMatchObject({ balanceDue: 1800, paymentStatus: 'partial' });
    expect(paymentTotals(total, [{ amount: 3600, type: 'payment' }]).paymentStatus).toBe('paid');
    expect(paymentTotals(total, [{ amount: 4000, type: 'payment' }])).toMatchObject({ balanceDue: -400, paymentStatus: 'overpaid' });
  });

  it('refunds subtract; cancelled stays owe nothing', () => {
    const cancelled = { status: 'cancelled' as const, totalAmount: 2400 };
    expect(paymentTotals(cancelled, [{ amount: 1200, type: 'advance' }, { amount: 1200, type: 'refund' }])).toEqual({
      amountPaid: 0,
      balanceDue: 0,
      paymentStatus: 'paid',
    });
    expect(paymentTotals(cancelled, [{ amount: 1200, type: 'advance' }]).paymentStatus).toBe('overpaid');
  });
});
