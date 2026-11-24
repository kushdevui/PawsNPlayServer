import { Types, type FilterQuery } from 'mongoose';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import { now } from '../../utils/clock.js';
import { isObjectId } from '../../utils/objectId.js';
import type { Pagination } from '../../utils/pagination.js';
import { nightsBetween } from '../../utils/time.js';
import { DogModel } from '../dogs/dogs.model.js';
import { loadSettings, withFacilityLock } from '../settings/settings.service.js';
import { BookingModel, OCCUPYING_STATUSES, OPEN_STATUSES, type BookingDoc, type BookingStatus } from './bookings.model.js';
import { ALLOWED_TRANSITIONS, humanStatus, money, peakOccupancy } from './bookings.rules.js';
import type { CreateBookingBody, ListBookingsQuery, UpdateBookingBody } from './bookings.schema.js';
import { withDog, withDogs, type PublicBooking } from './bookings.serializer.js';

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Booking by id, or 404 "Booking not found". */
export async function findBooking(id: string) {
  const booking = isObjectId(id) ? await BookingModel.findById(id) : null;
  if (!booking) throw AppError.notFound('Booking');
  return booking;
}

/** GET /bookings (spec §7.5): overlap with [from, to), status, dogId, paymentStatus; sorted by checkIn. */
export async function listBookings(
  { from, to, status, dogId, paymentStatus }: ListBookingsQuery,
  { page, limit, skip }: Pagination,
): Promise<{ items: PublicBooking[]; total: number }> {
  if (dogId !== undefined && !isObjectId(dogId)) return { items: [], total: 0 };
  const filter: FilterQuery<BookingDoc> = {};
  if (to) filter.checkIn = { $lt: to };
  if (from) filter.checkOut = { $gt: from };
  if (status) filter.status = status;
  if (dogId) filter.dogId = new Types.ObjectId(dogId);
  const sorted = () => BookingModel.find(filter).sort({ checkIn: 1, _id: 1 }).lean<BookingDoc[]>();

  if (!paymentStatus) {
    const [docs, total] = await Promise.all([sorted().skip(skip).limit(limit), BookingModel.countDocuments(filter)]);
    return { items: await withDogs(docs), total };
  }
  // paymentStatus is derived (§8.5), so filter after computing it. One facility's bookings fit in memory.
  const all = await withDogs(await sorted());
  const matching = all.filter((b) =>
    paymentStatus === 'due' ? b.balanceDue > 0 : b.paymentStatus === paymentStatus,
  );
  return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length };
}

export async function getBooking(id: string): Promise<PublicBooking> {
  return withDog(await findBooking(id));
}

/**
 * Shared create/edit validation, in the order of spec §7.5 steps 1-6 (§8.1, §8.2).
 * Must run inside withFacilityLock so the checks and the write are atomic.
 */
async function validateStay(input: { dogId: unknown; checkIn: unknown; checkOut: unknown }, ignoreId?: string) {
  const dog = isObjectId(input.dogId) ? await DogModel.findById(input.dogId).lean() : null;
  if (!dog) throw AppError.validation('Choose a dog.');
  if (dog.status !== 'active') throw AppError.validation(`${dog.name} is archived.`);

  const checkIn = toDate(input.checkIn);
  const checkOut = toDate(input.checkOut);
  if (!checkIn || !checkOut) throw AppError.validation('Enter check-in and check-out date and time.');
  if (checkOut.getTime() <= checkIn.getTime()) throw AppError.validation('Check-out must be after check-in.');

  const notThis = ignoreId ? { _id: { $ne: new Types.ObjectId(ignoreId) } } : {};
  const clash = await BookingModel.findOne(
    { ...notThis, dogId: dog._id, status: { $in: OPEN_STATUSES }, checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } },
    { _id: 1 },
  )
    .sort({ checkIn: 1 })
    .lean();
  if (clash) {
    throw AppError.rule('DOG_ALREADY_BOOKED', `${dog.name} already has a booking in these dates.`, {
      bookingId: clash._id.toHexString(),
    });
  }

  const settings = await loadSettings();
  const others = await BookingModel.find(
    { ...notThis, status: { $in: OCCUPYING_STATUSES }, checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } },
    { checkIn: 1, checkOut: 1, status: 1 },
  ).lean();
  const peak = peakOccupancy(
    others.map((b) => ({ id: b._id.toHexString(), checkIn: b.checkIn, checkOut: b.checkOut, status: b.status })),
    checkIn,
    checkOut,
    OCCUPYING_STATUSES,
  );
  if (peak >= settings.capacity) {
    throw AppError.rule('CAPACITY_FULL', `Boarding is full (${settings.capacity} dogs) for part of these dates.`, {
      peak,
      capacity: settings.capacity,
    });
  }
  return { dog, checkIn, checkOut, settings };
}

/** Step 7: price must be a number >= 0 (default settings.pricePerNight). */
function parsePrice(value: unknown, fallback: number): number {
  const price = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(price) || price < 0) throw AppError.validation('Price per night must be a positive number.');
  return money(price);
}

const parseKennel = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const kennel = String(value).trim().slice(0, 30);
  return kennel || null;
};
const parseNotes = (value: unknown): string => (value == null ? '' : String(value).slice(0, 2000));

/** POST /bookings (admin): status confirmed, server-computed nights/total/currency (spec §7.5). */
export async function createBooking(caller: AuthUser, body: CreateBookingBody): Promise<PublicBooking> {
  const booking = await withFacilityLock(async () => {
    const { dog, checkIn, checkOut, settings } = await validateStay(body);
    const pricePerNight = parsePrice(body.pricePerNight, settings.pricePerNight);
    const nights = nightsBetween(checkIn, checkOut, settings.timezone);
    return BookingModel.create({
      dogId: dog._id,
      checkIn,
      checkOut,
      status: 'confirmed',
      kennel: parseKennel(body.kennel),
      nights,
      pricePerNight,
      totalAmount: money(nights * pricePerNight),
      currency: settings.currency,
      notes: parseNotes(body.notes),
      source: 'admin',
      createdBy: new Types.ObjectId(caller.id),
      payments: [],
      statusHistory: [{ status: 'confirmed', at: now(), by: new Types.ObjectId(caller.id) }],
    });
  });
  return withDog(booking);
}

/** PATCH /bookings/:id (admin): edit dog/dates/kennel/price/notes, re-validated ignoring itself. */
export async function updateBooking(id: string, body: UpdateBookingBody): Promise<PublicBooking> {
  const updated = await withFacilityLock(async () => {
    const booking = await findBooking(id);
    if (booking.status === 'checked_out' || booking.status === 'cancelled') {
      throw AppError.rule('INVALID_STATE', `Booking is already ${humanStatus(booking.status)}.`);
    }
    // Like the mock: a missing (or empty) value keeps the current one.
    const next = {
      dogId: body.dogId ?? booking.dogId.toHexString(),
      checkIn: body.checkIn || booking.checkIn,
      checkOut: body.checkOut || booking.checkOut,
    };
    if (booking.status === 'checked_in' && String(next.dogId) !== booking.dogId.toHexString()) {
      throw AppError.rule('INVALID_STATE', 'Cannot change the dog after check-in.');
    }
    const { dog, checkIn, checkOut, settings } = await validateStay(next, booking._id.toHexString());
    const pricePerNight = body.pricePerNight !== undefined ? parsePrice(body.pricePerNight, 0) : booking.pricePerNight;
    const nights = nightsBetween(checkIn, checkOut, settings.timezone);

    booking.set({
      dogId: dog._id,
      checkIn,
      checkOut,
      pricePerNight,
      nights,
      totalAmount: money(nights * pricePerNight),
      ...(body.kennel !== undefined ? { kennel: parseKennel(body.kennel) } : {}),
      ...(body.notes !== undefined ? { notes: parseNotes(body.notes) } : {}),
    });
    return booking.save();
  });
  return withDog(updated);
}

/** PATCH /bookings/:id/status (admin, staff): state machine + capacity on check-in (spec §7.5). */
export async function updateStatus(caller: AuthUser, id: string, status: unknown): Promise<PublicBooking> {
  const run = async () => {
    const booking = await findBooking(id);
    const next = typeof status === 'string' ? status : String(status);
    if (!(ALLOWED_TRANSITIONS[booking.status] as string[]).includes(next)) {
      throw AppError.rule(
        'INVALID_STATE',
        `Cannot change a ${humanStatus(booking.status)} booking to ${humanStatus(next)}.`,
      );
    }
    const target = next as BookingStatus;
    if (target === 'checked_in') {
      const [settings, checkedIn] = await Promise.all([
        loadSettings(),
        BookingModel.countDocuments({ status: 'checked_in' }),
      ]);
      if (checkedIn >= settings.capacity) {
        throw AppError.rule('CAPACITY_FULL', `Boarding is full (${settings.capacity} dogs checked in).`);
      }
    }
    // Conditional write: if the status changed meanwhile nothing is written.
    const saved = await BookingModel.findOneAndUpdate(
      { _id: booking._id, status: booking.status },
      {
        $set: { status: target },
        $push: { statusHistory: { status: target, at: now(), by: new Types.ObjectId(caller.id) } },
      },
      { new: true },
    );
    if (!saved) throw AppError.rule('INVALID_STATE', 'This booking was just changed. Refresh and try again.');
    return saved;
  };
  // Check-in competes for capacity, so it takes the facility lock; other transitions don't need it.
  const saved = status === 'checked_in' ? await withFacilityLock(run) : await run();
  return withDog(saved);
}

/** Exposed for tests and the capacity acceptance test (§11). */
export async function peakFor(checkIn: Date, checkOut: Date): Promise<number> {
  const stays = await BookingModel.find(
    { status: { $in: OCCUPYING_STATUSES }, checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } },
    { checkIn: 1, checkOut: 1, status: 1 },
  ).lean();
  return peakOccupancy(
    stays.map((b) => ({ id: b._id.toHexString(), checkIn: b.checkIn, checkOut: b.checkOut, status: b.status })),
    checkIn,
    checkOut,
    OCCUPYING_STATUSES,
  );
}

