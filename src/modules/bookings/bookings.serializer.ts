import { DogModel } from '../dogs/dogs.model.js';
import { summarizeDog, type DogSummary } from '../dogs/dogs.serializer.js';
import type { BookingDoc, BookingSource, BookingStatus, PaymentMethod, PaymentType } from './bookings.model.js';
import { paymentTotals, type PaymentStatus } from './bookings.rules.js';

export interface PublicPayment {
  id: string;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note: string;
  receivedAt: Date;
  recordedBy: string;
}

/** App `Booking` (spec §6.3 Booking JSON) - every booking response uses exactly this shape. */
export interface PublicBooking {
  id: string;
  dogId: string;
  dog: DogSummary | null;
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;
  kennel: string | null;
  nights: number;
  pricePerNight: number;
  totalAmount: number;
  currency: string;
  notes: string;
  source: BookingSource;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  payments: PublicPayment[];
  amountPaid: number;
  balanceDue: number;
  paymentStatus: PaymentStatus;
}

export function serializeBooking(b: BookingDoc, dog: DogSummary | null): PublicBooking {
  return {
    id: b._id.toHexString(),
    dogId: b.dogId.toHexString(),
    dog,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
    kennel: b.kennel ?? null,
    nights: b.nights,
    pricePerNight: b.pricePerNight,
    totalAmount: b.totalAmount,
    currency: b.currency,
    notes: b.notes ?? '',
    source: b.source,
    createdBy: b.createdBy.toHexString(),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    payments: (b.payments ?? []).map((p) => ({
      id: p._id.toHexString(),
      amount: p.amount,
      type: p.type,
      method: p.method,
      note: p.note ?? '',
      receivedAt: p.receivedAt,
      recordedBy: p.recordedBy.toHexString(),
    })),
    ...paymentTotals(b, b.payments ?? []),
  };
}

/** Serializes bookings with their `dog` summary, loading all needed dogs in one query. */
export async function withDogs(bookings: BookingDoc[]): Promise<PublicBooking[]> {
  const ids = [...new Set(bookings.map((b) => b.dogId.toHexString()))];
  const dogs = ids.length
    ? await DogModel.find({ _id: { $in: ids } }, { name: 1, breed: 1, ownerName: 1, ownerPhone: 1 }).lean()
    : [];
  const byId = new Map<string, DogSummary>(dogs.map((d) => [d._id.toHexString(), summarizeDog(d)]));
  return bookings.map((b) => serializeBooking(b, byId.get(b.dogId.toHexString()) ?? null));
}

export async function withDog(booking: BookingDoc): Promise<PublicBooking> {
  const [result] = await withDogs([booking]);
  return result as PublicBooking;
}
