import { z } from 'zod';
import { enumOf } from '../../utils/schemas.js';
import { SPECIES } from '../pets/pets.model.js';
import { SERVICE_CATEGORIES } from './services.model.js';

const REQUIRED = 'Name, category and price are required.';
const CATEGORY_MESSAGE = `Category must be one of: ${SERVICE_CATEGORIES.join(', ')}.`;

const fields = {
  name: z.string({ required_error: REQUIRED, invalid_type_error: REQUIRED }).trim().min(1, REQUIRED).max(100, 'Name is too long.'),
  category: z.enum(SERVICE_CATEGORIES, {
    errorMap: (issue) => ({ message: issue.code === 'invalid_type' ? REQUIRED : CATEGORY_MESSAGE }),
  }),
  description: z.string({ invalid_type_error: 'Description must be text.' }).max(2000, 'Description is too long.'),
  durationMinutes: z.coerce
    .number({ invalid_type_error: 'Duration must be a number of minutes.' })
    .int('Duration must be whole minutes.')
    .min(1, 'Duration must be at least 1 minute.')
    .max(24 * 60, 'Duration cannot be longer than a day.'),
  // Like the mock (`!b.price`), a price of 0 is rejected. Numeric strings are accepted.
  price: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
    z
      .number({ required_error: REQUIRED, invalid_type_error: 'Price must be a number.' })
      .positive('Price must be more than 0.'),
  ),
  currency: z
    .string({ invalid_type_error: 'Currency must be a 3-letter code.' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code.'),
  speciesAllowed: z
    .array(enumOf(SPECIES, 'Species must be dog or cat.'), { invalid_type_error: 'Pick at least one species.' })
    .min(1, 'Pick at least one species.')
    .transform((list) => [...new Set(list)]),
  active: z.boolean({ invalid_type_error: 'Active must be true or false.' }),
};

/** ServiceInput with the mock's defaults. */
export const createServiceBody = z.object({
  name: fields.name,
  category: fields.category,
  description: fields.description.default(''),
  durationMinutes: fields.durationMinutes.default(60),
  price: fields.price,
  currency: fields.currency.default('INR'),
  speciesAllowed: fields.speciesAllowed.default(['dog', 'cat']),
  active: fields.active.default(true),
});
export type CreateServiceBody = z.infer<typeof createServiceBody>;

/** Partial<ServiceInput>; `id` is not in the schema, so it is dropped. */
export const updateServiceBody = z.object({
  name: fields.name.optional(),
  category: fields.category.optional(),
  description: fields.description.optional(),
  durationMinutes: fields.durationMinutes.optional(),
  price: fields.price.optional(),
  currency: fields.currency.optional(),
  speciesAllowed: fields.speciesAllowed.optional(),
  active: fields.active.optional(),
});
export type UpdateServiceBody = z.infer<typeof updateServiceBody>;

export const listServicesQuery = z
  .object({ category: enumOf(SERVICE_CATEGORIES, CATEGORY_MESSAGE).optional() })
  .passthrough();
export type ListServicesQuery = z.infer<typeof listServicesQuery>;
