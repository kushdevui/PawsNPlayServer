/**
 * Pure business rules from spec §8 (no database access), shared by bookings, dashboard, occupancy, billing.
 * Intervals are half-open [checkIn, checkOut).
 */
import type { BookingStatus, PaymentType } from './bookings.model.js';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid';

export interface Stay {
  id: string;
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;
}

const t = (d: Date) => d.getTime();

/** Two stays overlap iff a.checkIn < b.checkOut && b.checkIn < a.checkOut. */
export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/**
 * §8.2 peakOccupancy: highest number of stays present at the same instant within [start, end).
 * Candidate instants are `start` and every check-in strictly inside the window.
 */
export function peakOccupancy(
  stays: Stay[],
  start: Date,
  end: Date,
  statuses: readonly BookingStatus[],
  ignoreId?: string,
): number {
  const s = t(start);
  const e = t(end);
  const relevant = stays.filter(
    (b) => b.id !== ignoreId && statuses.includes(b.status) && overlaps(s, e, t(b.checkIn), t(b.checkOut)),
  );
  const points = [s, ...relevant.map((b) => t(b.checkIn)).filter((p) => p > s && p < e)];
  let peak = 0;
  for (const p of points) {
    const count = relevant.filter((b) => t(b.checkIn) <= p && p < t(b.checkOut)).length;
    if (count > peak) peak = count;
  }
  return peak;
}

/** Rounds money to 2 decimals (spec §3: never floats with more than 2 decimals). */
export const money = (n: number): number => Math.round(n * 100) / 100;

/** §8.5 derived money fields. */
export function paymentTotals(
  booking: { status: BookingStatus; totalAmount: number },
  payments: Array<{ amount: number; type: PaymentType }>,
): { amountPaid: number; balanceDue: number; paymentStatus: PaymentStatus } {
  const amountPaid = money(payments.reduce((sum, p) => sum + (p.type === 'refund' ? -p.amount : p.amount), 0));
  const owed = booking.status === 'cancelled' ? 0 : booking.totalAmount;
  const balanceDue = money(owed - amountPaid);
  const paymentStatus: PaymentStatus =
    balanceDue < 0 ? 'overpaid' : owed === 0 || balanceDue === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
  return { amountPaid, balanceDue, paymentStatus };
}

/** §7.5 status machine. */
export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
};

/** "checked_in" -> "checked in" for user-facing messages. */
export const humanStatus = (status: string): string => status.replaceAll('_', ' ');
