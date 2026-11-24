import type { FilterQuery, HydratedDocument } from 'mongoose';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { Pagination } from '../../utils/pagination.js';
import type { Role } from '../auth/roles.js';
import { PetModel } from '../pets/pets.model.js';
import { ServiceModel } from '../services/services.model.js';
import { UserModel } from '../users/users.model.js';
import { BookingModel, type BookingDoc, type BookingStatus } from './bookings.model.js';
import type { CreateBookingBody, ListBookingsQuery } from './bookings.schema.js';

type BookingDocument = HydratedDocument<BookingDoc>;

/** admin: all · staff: assigned to them · user: their own. Anything else is "not found". */
const visibleTo = (caller: AuthUser): FilterQuery<BookingDoc> => {
  if (caller.role === 'admin') return {};
  return caller.role === 'staff' ? { staffId: caller.id } : { userId: caller.id };
};

/** Status targets each role may set (mirrors the app mock). */
const ALLOWED_TARGETS: Record<Role, readonly BookingStatus[]> = {
  admin: ['confirmed', 'completed', 'cancelled'],
  staff: ['completed'],
  user: ['cancelled'],
};
const FINAL_STATUSES: readonly BookingStatus[] = ['completed', 'cancelled'];

const isTarget = (role: Role, status: string | undefined): status is BookingStatus =>
  (ALLOWED_TARGETS[role] as readonly string[]).includes(status ?? '');

/** Sorted by startTime, newest first; filters status, from, to (inclusive, on startTime). */
export async function listBookings(
  caller: AuthUser,
  { status, from, to }: ListBookingsQuery,
  { skip, limit }: Pagination,
): Promise<{ items: BookingDocument[]; total: number }> {
  const filter: FilterQuery<BookingDoc> = { ...visibleTo(caller) };
  if (status) filter.status = status;
  if (from || to) filter.startTime = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  const [items, total] = await Promise.all([
    BookingModel.find(filter).sort({ startTime: -1, _id: 1 }).skip(skip).limit(limit),
    BookingModel.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getBooking(caller: AuthUser, id: string): Promise<BookingDocument> {
  const booking = await BookingModel.findOne({ _id: id, ...visibleTo(caller) });
  if (!booking) throw AppError.notFound('Booking');
  return booking;
}

/** User only (enforced by the route). The server sets times, price, status and staff. */
export async function createBooking(caller: AuthUser, input: CreateBookingBody): Promise<BookingDocument> {
  const pet = await PetModel.findOne({ _id: input.petId, ownerId: caller.id });
  if (!pet) throw AppError.validation('Choose one of your pets.');

  const service = await ServiceModel.findOne({ _id: input.serviceId, active: true });
  if (!service) throw AppError.validation('Service is not available.');
  if (!service.speciesAllowed.includes(pet.species)) {
    throw AppError.validation(`${service.name} is not available for ${pet.species}s.`);
  }

  const start = new Date(input.startTime);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
    throw AppError.validation('Pick a future date and time.');
  }

  return BookingModel.create({
    userId: caller.id,
    petId: pet._id,
    serviceId: service._id,
    staffId: null,
    startTime: start,
    endTime: new Date(start.getTime() + service.durationMinutes * 60_000),
    status: 'pending',
    notes: input.notes,
    totalPrice: service.price,
    currency: service.currency,
  });
}

/**
 * Order of checks mirrors the mock: not visible -> 404, target not allowed for the role -> 403,
 * already final -> 422, completing a non-confirmed booking -> 422.
 */
export async function updateStatus(
  caller: AuthUser,
  id: string,
  target: string | undefined,
): Promise<BookingDocument> {
  const booking = await getBooking(caller, id);
  if (!isTarget(caller.role, target)) {
    throw AppError.forbidden(`You cannot set status to "${target ?? ''}".`);
  }
  if (FINAL_STATUSES.includes(booking.status)) {
    throw AppError.invalidState(`Booking is already ${booking.status}.`);
  }
  if (target === 'completed' && booking.status !== 'confirmed') {
    throw AppError.invalidState('Only confirmed bookings can be completed.');
  }

  // Conditional update: if someone changed the status meanwhile, nothing is written.
  const updated = await BookingModel.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    { $set: { status: target } },
    { new: true },
  );
  if (!updated) throw AppError.invalidState('This booking was just changed. Refresh and try again.');
  return updated;
}

/** Admin only (enforced by the route). The staff member must be an active `staff` user. */
export async function assignStaff(id: string, staffId: string): Promise<BookingDocument> {
  const staff = staffId ? await UserModel.exists({ _id: staffId, role: 'staff', status: 'active' }) : null;
  // TODO(contract): confirm with app - the mock also allows assigning completed/cancelled bookings.
  const booking = await BookingModel.findById(id);
  if (!booking) throw AppError.notFound('Booking');
  if (!staff) throw AppError.validation('Choose an active staff member.');

  const updated = await BookingModel.findByIdAndUpdate(id, { $set: { staffId } }, { new: true });
  if (!updated) throw AppError.notFound('Booking');
  return updated;
}
