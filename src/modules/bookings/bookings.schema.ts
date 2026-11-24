import { z } from 'zod';
import { BOOKING_STATUSES } from './bookings.model.js';

/**
 * Booking bodies are only picked here; the ordered rule checks (spec §7.5 steps 1-7) run in the service so
 * the first failing rule produces the exact message the app expects. Unknown fields are dropped.
 */
const loose = z.unknown().optional();

export const createBookingBody = z.object({
  dogId: loose,
  checkIn: loose,
  checkOut: loose,
  kennel: loose,
  pricePerNight: loose,
  notes: loose,
});
export type CreateBookingBody = z.infer<typeof createBookingBody>;

export const updateBookingBody = createBookingBody;
export type UpdateBookingBody = CreateBookingBody;

export const updateStatusBody = z.object({ status: loose });
export type UpdateStatusBody = z.infer<typeof updateStatusBody>;

export const createPaymentBody = z.object({
  amount: loose,
  type: loose,
  method: loose,
  note: loose,
  receivedAt: loose,
});
export type CreatePaymentBody = z.infer<typeof createPaymentBody>;

export const paymentParams = z.object({ id: z.string().trim().min(1), paymentId: z.string().trim().min(1) });

const isoDate = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), message)
    .transform((value) => new Date(value));

/** GET /bookings query (spec §7.5). Unknown params are ignored. */
export const listBookingsQuery = z
  .object({
    from: isoDate('Enter a valid "from" date.').optional(),
    to: isoDate('Enter a valid "to" date.').optional(),
    status: z.enum(BOOKING_STATUSES, { errorMap: () => ({ message: 'Invalid status.' }) }).optional(),
    dogId: z.string().trim().optional(),
    paymentStatus: z
      .enum(['unpaid', 'partial', 'paid', 'overpaid', 'due'], {
        errorMap: () => ({ message: 'Invalid payment status.' }),
      })
      .optional(),
  })
  .passthrough();
export type ListBookingsQuery = z.infer<typeof listBookingsQuery>;
