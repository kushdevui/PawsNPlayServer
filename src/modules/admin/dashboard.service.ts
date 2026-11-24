import { now } from '../../utils/clock.js';
import { addLocalDays, localMonthRange, startOfLocalDay } from '../../utils/time.js';
import { BookingModel, type BookingDoc } from '../bookings/bookings.model.js';
import { money, paymentTotals } from '../bookings/bookings.rules.js';
import { withDogs, type PublicBooking } from '../bookings/bookings.serializer.js';
import { DogModel } from '../dogs/dogs.model.js';
import { loadSettings } from '../settings/settings.service.js';
import { occupancyDays } from './occupancy.service.js';

/** App `DashboardStats` (spec §7.8). */
export interface DashboardStats {
  capacity: number;
  occupiedNow: number;
  availableNow: number;
  todayCheckIns: PublicBooking[];
  todayCheckOuts: PublicBooking[];
  upcoming: PublicBooking[];
  occupancyNext7Days: Array<{ date: string; count: number }>;
  activeDogs: number;
  bookingsThisMonth: number;
  paymentsDue: number;
  paymentsDueBookings: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** All "today/month" boundaries are in the facility timezone; `now` comes from the clock (tests pin it). */
export async function getDashboard(at: Date = now()): Promise<DashboardStats> {
  const settings = await loadSettings();
  const tz = settings.timezone;
  const todayStart = startOfLocalDay(at, tz);
  const todayEnd = addLocalDays(todayStart, 1, tz);
  const month = localMonthRange(at, tz);

  const [occupiedNow, checkIns, checkOuts, upcoming, days, activeDogs, bookingsThisMonth, open] = await Promise.all([
    BookingModel.countDocuments({ status: 'checked_in' }),
    BookingModel.find({
      status: { $in: ['confirmed', 'checked_in', 'checked_out'] },
      checkIn: { $gte: todayStart, $lt: todayEnd },
    })
      .sort({ checkIn: 1, _id: 1 })
      .lean<BookingDoc[]>(),
    BookingModel.find({ status: { $in: ['checked_in', 'checked_out'] }, checkOut: { $gte: todayStart, $lt: todayEnd } })
      .sort({ checkOut: 1, _id: 1 })
      .lean<BookingDoc[]>(),
    BookingModel.find({ status: 'confirmed', checkIn: { $gte: at, $lt: new Date(at.getTime() + WEEK_MS) } })
      .sort({ checkIn: 1, _id: 1 })
      .lean<BookingDoc[]>(),
    occupancyDays(todayStart, 7, tz, settings.capacity, at),
    DogModel.countDocuments({ status: 'active' }),
    BookingModel.countDocuments({ status: { $ne: 'cancelled' }, checkIn: { $lt: month.end }, checkOut: { $gt: month.start } }),
    BookingModel.find({ status: { $ne: 'cancelled' } }, { status: 1, totalAmount: 1, payments: 1 }).lean(),
  ]);

  const due = open.map((b) => paymentTotals(b, b.payments ?? [])).filter((t) => t.balanceDue > 0);
  const [todayCheckIns, todayCheckOuts, upcomingBookings] = await Promise.all([
    withDogs(checkIns),
    withDogs(checkOuts),
    withDogs(upcoming),
  ]);

  return {
    capacity: settings.capacity,
    occupiedNow,
    availableNow: Math.max(0, settings.capacity - occupiedNow),
    todayCheckIns,
    todayCheckOuts,
    upcoming: upcomingBookings,
    occupancyNext7Days: days.map((d) => ({ date: d.date, count: d.occupied })),
    activeDogs,
    bookingsThisMonth,
    paymentsDue: money(due.reduce((sum, t) => sum + t.balanceDue, 0)),
    paymentsDueBookings: due.length,
  };
}
