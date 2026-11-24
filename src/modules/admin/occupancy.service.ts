import { AppError } from '../../utils/AppError.js';
import { now } from '../../utils/clock.js';
import { addLocalDays, localDateKey, parseDateKey, startOfLocalDay } from '../../utils/time.js';
import { BookingModel, OCCUPYING_STATUSES, type BookingStatus } from '../bookings/bookings.model.js';
import { peakOccupancy, type Stay } from '../bookings/bookings.rules.js';
import { loadSettings } from '../settings/settings.service.js';

/** App `OccupancyDay`. */
export interface OccupancyDay {
  date: string;
  occupied: number;
  available: number;
  checkIns: number;
  checkOuts: number;
}

export const MAX_OCCUPANCY_DAYS = 62;
const PAST_STATUSES: BookingStatus[] = [...OCCUPYING_STATUSES, 'checked_out'];

/**
 * §8.6 dayStats for `count` consecutive local days starting at `firstDay` (a local midnight).
 * Past days (entirely before today) also count checked-out stays so history stays accurate.
 */
export async function occupancyDays(
  firstDay: Date,
  count: number,
  tz: string,
  capacity: number,
  at: Date = now(),
): Promise<OccupancyDay[]> {
  const bounds = Array.from({ length: count + 1 }, (_, i) => addLocalDays(firstDay, i, tz));
  const rangeStart = bounds[0] as Date;
  const rangeEnd = bounds[count] as Date;
  // checkOut >= rangeStart (not >) so a stay ending exactly at the first midnight still counts as a check-out.
  const docs = await BookingModel.find(
    { status: { $in: PAST_STATUSES }, checkIn: { $lt: rangeEnd }, checkOut: { $gte: rangeStart } },
    { checkIn: 1, checkOut: 1, status: 1 },
  ).lean();
  const stays: Stay[] = docs.map((b) => ({
    id: b._id.toHexString(),
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
  }));
  const todayStart = startOfLocalDay(at, tz).getTime();

  return Array.from({ length: count }, (_, i) => {
    const dayStart = bounds[i] as Date;
    const dayEnd = bounds[i + 1] as Date;
    const statuses = dayEnd.getTime() <= todayStart ? PAST_STATUSES : OCCUPYING_STATUSES;
    const occupied = peakOccupancy(stays, dayStart, dayEnd, statuses);
    const counted = stays.filter((b) => statuses.includes(b.status));
    const within = (d: Date) => d.getTime() >= dayStart.getTime() && d.getTime() < dayEnd.getTime();
    return {
      date: localDateKey(dayStart, tz),
      occupied,
      available: Math.max(0, capacity - occupied),
      checkIns: counted.filter((b) => within(b.checkIn)).length,
      checkOuts: counted.filter((b) => within(b.checkOut)).length,
    };
  });
}

/** GET /admin/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD (local dates, `to` exclusive, max 62 days). */
export async function getOccupancy(fromKey: unknown, toKey: unknown) {
  const settings = await loadSettings();
  const tz = settings.timezone;
  const from = parseDateKey(fromKey, tz);
  const to = parseDateKey(toKey, tz);
  if (!from || !to || to.getTime() <= from.getTime()) {
    throw AppError.validation('from and to must be YYYY-MM-DD with to after from.');
  }
  // Like the mock, longer ranges are cut at 62 days.
  let count = 0;
  while (count < MAX_OCCUPANCY_DAYS && addLocalDays(from, count, tz).getTime() < to.getTime()) count += 1;
  return { capacity: settings.capacity, days: await occupancyDays(from, count, tz, settings.capacity) };
}
