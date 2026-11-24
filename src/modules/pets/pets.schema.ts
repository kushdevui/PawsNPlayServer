import { z } from 'zod';
import { enumOf, urlOrNull } from '../../utils/schemas.js';
import { PET_GENDERS, SPECIES } from './pets.model.js';

const REQUIRED = 'Name and species are required.';
const DOB_MESSAGE = 'Enter the date of birth as YYYY-MM-DD.';

const isRealDate = (value: string) => {
  if (value === '') return true;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const fields = {
  name: z.string({ required_error: REQUIRED, invalid_type_error: REQUIRED }).trim().min(1, REQUIRED).max(100, 'Name is too long.'),
  species: z.enum(SPECIES, {
    errorMap: (issue) => ({ message: issue.code === 'invalid_type' ? REQUIRED : 'Species must be dog or cat.' }),
  }),
  breed: z.string({ invalid_type_error: 'Breed must be text.' }).trim().max(100, 'Breed is too long.'),
  gender: enumOf(PET_GENDERS, 'Gender must be male or female.'),
  dateOfBirth: z
    .string({ invalid_type_error: DOB_MESSAGE })
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, DOB_MESSAGE)
    .refine(isRealDate, DOB_MESSAGE),
  weightKg: z.coerce
    .number({ invalid_type_error: 'Weight must be a number.' })
    .min(0, 'Weight cannot be negative.')
    .max(200, 'Weight looks too high.'),
  vaccinated: z.boolean({ invalid_type_error: 'Vaccinated must be true or false.' }),
  notes: z.string({ invalid_type_error: 'Notes must be text.' }).max(1000, 'Notes are too long.'),
  // TODO(contract): confirm with app - the mock accepts any string; the server requires a URL.
  photoUrl: urlOrNull('Enter a valid photo link.'),
};

/** PetInput. Defaults match the app mock. `ownerId` is only honoured for admins. */
export const createPetBody = z.object({
  name: fields.name,
  species: fields.species,
  breed: fields.breed.default(''),
  gender: fields.gender.default('male'),
  dateOfBirth: fields.dateOfBirth.default(''),
  weightKg: fields.weightKg.default(0),
  vaccinated: fields.vaccinated.default(false),
  notes: fields.notes.default(''),
  photoUrl: fields.photoUrl.default(null),
  ownerId: z.string({ invalid_type_error: 'Choose an existing owner.' }).trim().min(1).optional(),
});
export type CreatePetBody = z.infer<typeof createPetBody>;

/** Partial<PetInput>. id, ownerId and createdAt are not in the schema, so they are dropped. */
export const updatePetBody = z.object({
  name: fields.name.optional(),
  species: fields.species.optional(),
  breed: fields.breed.optional(),
  gender: fields.gender.optional(),
  dateOfBirth: fields.dateOfBirth.optional(),
  weightKg: fields.weightKg.optional(),
  vaccinated: fields.vaccinated.optional(),
  notes: fields.notes.optional(),
  photoUrl: fields.photoUrl.optional(),
});
export type UpdatePetBody = z.infer<typeof updatePetBody>;

export const listPetsQuery = z
  .object({
    species: enumOf(SPECIES, 'Species must be dog or cat.').optional(),
    ownerId: z.string().trim().min(1).optional(),
  })
  .passthrough();
export type ListPetsQuery = z.infer<typeof listPetsQuery>;
