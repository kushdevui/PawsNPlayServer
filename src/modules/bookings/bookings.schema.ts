import { z } from 'zod';
import { enumOf } from '../../utils/schemas.js';
import { BOOKING_STATUSES } from './bookings.model.js';

const REQUIRED = 'Pet, service and start time are required.';
const requiredText = z.string({ required_error: REQUIRED, invalid_type_error: REQUIRED }).trim().min(1, REQUIRED);

/** The future-date rule lives in the service (needs "now"), with the mock's message. */
export const createBookingBody = z.object({
  petId: requiredText,
  serviceId: requiredText,
  startTime: requiredText,
  notes: z.string({ invalid_type_error: 'Notes must be text.' }).max(1000, 'Notes are too long.').default(''),
});
export type CreateBookingBody = z.infer<typeof createBookingBody>;

/** Any value is accepted here: targets a role may not set (including unknown ones) are 403, like the mock. */
export const updateStatusBody = z.object({ status: z.string().optional().catch(undefined) }).catch({});
export type UpdateStatusBody = z.infer<typeof updateStatusBody>;

/** A missing/unknown staffId becomes 422 "Choose an active staff member." in the service. */
export const assignStaffBody = z.object({ staffId: z.string().trim().catch('') }).catch({ staffId: '' });
export type AssignStaffBody = z.infer<typeof assignStaffBody>;

const DATE_MESSAGE = 'Enter a valid date.';
const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), DATE_MESSAGE)
  .transform((value) => new Date(value));

export const listBookingsQuery = z
  .object({
    status: enumOf(BOOKING_STATUSES, 'Invalid status.').optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .passthrough();
export type ListBookingsQuery = z.infer<typeof listBookingsQuery>;
