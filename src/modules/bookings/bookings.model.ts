import { Schema, model } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';
import { newId } from '../../utils/ids.js';

export const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Stored shape. Public shape = app `Booking`. */
export interface BookingDoc {
  _id: string;
  userId: string;
  petId: string;
  serviceId: string;
  staffId: string | null;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  notes: string;
  totalPrice: number;
  currency: string;
  createdAt: Date;
}

const bookingSchema = new Schema<BookingDoc>(
  {
    _id: { type: String, default: () => newId('b') },
    userId: { type: String, ref: 'User', required: true },
    petId: { type: String, ref: 'Pet', required: true },
    serviceId: { type: String, ref: 'Service', required: true },
    staffId: { type: String, ref: 'User', default: null },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: BOOKING_STATUSES, required: true, default: 'pending' },
    notes: { type: String, default: '' },
    totalPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { ...baseSchemaOptions, collection: 'bookings' },
);

// Lists are filtered by owner/staff/status and sorted by startTime desc.
bookingSchema.index({ userId: 1, startTime: -1 });
bookingSchema.index({ staffId: 1, startTime: -1 });
bookingSchema.index({ status: 1, startTime: -1 });
bookingSchema.index({ startTime: -1 });

export const BookingModel = model<BookingDoc>('Booking', bookingSchema);
