import { AppError } from '../../utils/AppError.js';
import { BookingModel } from '../bookings/bookings.model.js';
import { money, paymentTotals } from '../bookings/bookings.rules.js';
import { loadSettings } from '../settings/settings.service.js';

/** App `BillingSummary` (spec §7.10); `from`/`to` echo the query (null if omitted). */
export interface BillingSummary {
  from: string | null;
  to: string | null;
  currency: string;
  bookings: number;
  expected: number;
  received: number;
  due: number;
  advances: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  outstandingAllTime: number;
  outstandingBookings: number;
  collected: number;
  collectedCount: number;
}

const parseBound = (value: unknown, label: string): Date | null => {
  if (value === undefined || value === '') return null;
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw AppError.validation(`Enter a valid "${label}" date.`);
  return date;
};

const sum = (values: number[]) => money(values.reduce((n, v) => n + v, 0));

/** §8.7 billing for [from, to): stays grouped by check-in date + cash collected in the period. */
export async function getBilling(fromRaw: unknown, toRaw: unknown): Promise<BillingSummary> {
  const from = parseBound(fromRaw, 'from');
  const to = parseBound(toRaw, 'to');
  const settings = await loadSettings();

  const range: Record<string, Date> = {};
  if (from) range.$gte = from;
  if (to) range.$lt = to;

  const [inRangeDocs, openDocs, paidDocs] = await Promise.all([
    BookingModel.find(
      { status: { $ne: 'cancelled' }, ...(from || to ? { checkIn: range } : {}) },
      { status: 1, totalAmount: 1, payments: 1 },
    ).lean(),
    BookingModel.find({ status: { $ne: 'cancelled' } }, { status: 1, totalAmount: 1, payments: 1 }).lean(),
    BookingModel.find(
      from || to ? { payments: { $elemMatch: { receivedAt: range } } } : { 'payments.0': { $exists: true } },
      { payments: 1 },
    ).lean(),
  ]);

  const inRange = inRangeDocs.map((b) => ({ ...b, ...paymentTotals(b, b.payments ?? []) }));
  const open = openDocs.map((b) => paymentTotals(b, b.payments ?? [])).filter((t) => t.balanceDue > 0);
  const inPeriod = (d: Date) => (!from || d.getTime() >= from.getTime()) && (!to || d.getTime() < to.getTime());
  const collectedPayments = paidDocs.flatMap((b) => b.payments ?? []).filter((p) => inPeriod(p.receivedAt));

  return {
    from: typeof fromRaw === 'string' ? fromRaw : null,
    to: typeof toRaw === 'string' ? toRaw : null,
    currency: settings.currency,
    bookings: inRange.length,
    expected: sum(inRange.map((b) => b.totalAmount)),
    received: sum(inRange.map((b) => b.amountPaid)),
    due: sum(inRange.map((b) => Math.max(0, b.balanceDue))),
    advances: sum(inRange.flatMap((b) => (b.payments ?? []).filter((p) => p.type === 'advance').map((p) => p.amount))),
    paidCount: inRange.filter((b) => b.paymentStatus === 'paid' || b.paymentStatus === 'overpaid').length,
    partialCount: inRange.filter((b) => b.paymentStatus === 'partial').length,
    unpaidCount: inRange.filter((b) => b.paymentStatus === 'unpaid').length,
    outstandingAllTime: sum(open.map((t) => t.balanceDue)),
    outstandingBookings: open.length,
    collected: sum(collectedPayments.map((p) => (p.type === 'refund' ? -p.amount : p.amount))),
    collectedCount: collectedPayments.length,
  };
}
