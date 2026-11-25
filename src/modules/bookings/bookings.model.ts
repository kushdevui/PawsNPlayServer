import { Schema, model, type Types } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';

export const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_SOURCES = ['admin', 'app'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];
export const PAYMENT_TYPES = ['advance', 'payment', 'refund'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Spec §8: bookings that hold a kennel, and bookings that block the same dog. */
export const OCCUPYING_STATUSES: BookingStatus[] = ['confirmed', 'checked_in'];
export const OPEN_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'checked_in'];

export interface PaymentDoc {
  _id: Types.ObjectId;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note: string;
  receivedAt: Date;
  recordedBy: Types.ObjectId;
}

export interface StatusHistoryDoc {
  status: BookingStatus;
  at: Date;
  by: Types.ObjectId;
}

/** Stored shape (spec §6.3). `dog`, `amountPaid`, `balanceDue`, `paymentStatus` are derived per response. */
export interface BookingDoc {
  _id: Types.ObjectId;
  dogId: Types.ObjectId;
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
  createdBy: Types.ObjectId;
  payments: PaymentDoc[];
  /** Audit trail (recommended by the spec); internal, not returned. */
  statusHistory: StatusHistoryDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDoc>(
  {
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: PAYMENT_TYPES, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    note: { type: String, default: '', trim: true },
    receivedAt: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { versionKey: false },
);

const statusHistorySchema = new Schema<StatusHistoryDoc>(
  {
    status: { type: String, enum: BOOKING_STATUSES, required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false, versionKey: false },
);

const bookingSchema = new Schema<BookingDoc>(
  {
    dogId: { type: Schema.Types.ObjectId, ref: 'Dog', required: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    status: { type: String, enum: BOOKING_STATUSES, required: true, default: 'confirmed' },
    kennel: { type: String, default: null, trim: true },
    nights: { type: Number, required: true, min: 1 },
    pricePerNight: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'INR' },
    notes: { type: String, default: '' },
    source: { type: String, enum: BOOKING_SOURCES, default: 'admin' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    payments: { type: [paymentSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { ...baseSchemaOptions, collection: 'bookings' },
);

bookingSchema.index({ checkIn: 1, checkOut: 1 });
bookingSchema.index({ status: 1, checkIn: 1 });
bookingSchema.index({ dogId: 1, checkIn: -1 });
bookingSchema.index({ 'payments.receivedAt': 1 });

export const BookingModel = model<BookingDoc>('Booking', bookingSchema);
