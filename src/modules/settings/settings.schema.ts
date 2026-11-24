import { z } from 'zod';
import { TIME_OF_DAY } from './settings.model.js';

const CAPACITY_MESSAGE = 'Capacity must be a whole number between 1 and 500.';
const PRICE_MESSAGE = 'Price per night must be 0 or more.';

const numeric = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value);

/**
 * PATCH /settings body, checked in the mock's order: capacity, price, times, facility name (spec §7.7).
 * currency and timezone are read-only and dropped. Capacity must be a JSON number (like the mock).
 */
export const updateSettingsBody = z.object({
  capacity: z
    .number({ invalid_type_error: CAPACITY_MESSAGE })
    .int(CAPACITY_MESSAGE)
    .min(1, CAPACITY_MESSAGE)
    .max(500, CAPACITY_MESSAGE)
    .optional(),
  pricePerNight: z
    .preprocess(numeric, z.number({ invalid_type_error: PRICE_MESSAGE }).min(0, PRICE_MESSAGE).finite(PRICE_MESSAGE))
    .optional(),
  defaultCheckInTime: z
    .string({ invalid_type_error: 'Check-in time must be HH:mm.' })
    .regex(TIME_OF_DAY, 'Check-in time must be HH:mm.')
    .optional(),
  defaultCheckOutTime: z
    .string({ invalid_type_error: 'Check-out time must be HH:mm.' })
    .regex(TIME_OF_DAY, 'Check-out time must be HH:mm.')
    .optional(),
  facilityName: z
    .string({ invalid_type_error: 'Facility name is required.' })
    .trim()
    .min(1, 'Facility name is required.')
    .max(100, 'Facility name is too long.')
    .optional(),
});
export type UpdateSettingsBody = z.infer<typeof updateSettingsBody>;
