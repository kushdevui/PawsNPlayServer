import type { HydratedDocument } from 'mongoose';
import { BookingModel, BOOKING_STATUSES, type BookingDoc, type BookingStatus } from '../bookings/bookings.model.js';
import { PetModel } from '../pets/pets.model.js';
import { UserModel } from '../users/users.model.js';

const UPCOMING_LIMIT = 5;
// TODO(contract): confirm with app - revenue is always reported in INR (like the mock), even if a
// service is priced in another currency.
const REVENUE_CURRENCY = 'INR';

/** Same shape as the app's DashboardStats. */
export interface DashboardStats {
  totalUsers: number;
  totalStaff: number;
  totalPets: number;
  bookingsByStatus: Record<BookingStatus, number>;
  revenue: { amount: number; currency: string };
  upcomingBookings: HydratedDocument<BookingDoc>[];
}

export async function getDashboard(now: Date = new Date()): Promise<DashboardStats> {
  const [totalUsers, totalStaff, totalPets, statusCounts, revenueRows, upcomingBookings] = await Promise.all([
    UserModel.countDocuments({ role: 'user' }),
    UserModel.countDocuments({ role: 'staff' }),
    PetModel.countDocuments(),
    BookingModel.aggregate<{ _id: BookingStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    BookingModel.aggregate<{ amount: number }>([
      { $match: { status: 'completed' } },
      { $group: { _id: null, amount: { $sum: '$totalPrice' } } },
    ]),
    BookingModel.find({ startTime: { $gte: now }, status: { $in: ['pending', 'confirmed'] } })
      .sort({ startTime: 1, _id: 1 })
      .limit(UPCOMING_LIMIT),
  ]);

  // Always all four keys, even when a status has no bookings.
  const bookingsByStatus = Object.fromEntries(BOOKING_STATUSES.map((status) => [status, 0])) as Record<
    BookingStatus,
    number
  >;
  for (const row of statusCounts) {
    if (row._id in bookingsByStatus) bookingsByStatus[row._id] = row.count;
  }

  return {
    totalUsers,
    totalStaff,
    totalPets,
    bookingsByStatus,
    revenue: { amount: revenueRows[0]?.amount ?? 0, currency: REVENUE_CURRENCY },
    upcomingBookings,
  };
}
