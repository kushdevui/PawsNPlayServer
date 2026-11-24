import { z } from 'zod';
import { isObjectId } from '../../utils/objectId.js';
import { enumOf } from '../../utils/schemas.js';
import {
  ALLOWED_MIME,
  DOCUMENT_KINDS,
  DOG_STATUSES,
  GENDERS,
  MAX_DOCUMENTS,
  MAX_FILE_BYTES,
  TEMPERAMENTS,
} from './dogs.model.js';

const DOCS_COUNT = 'Up to 10 documents per dog.';
const DOCS_TYPE = 'Documents must be images or PDFs.';

const requiredText = (message: string, max: number) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .min(1, message)
    .max(max, message === 'Dog name is required.' ? 'Dog name is too long.' : 'This is too long.');

const optionalText = (label: string, max: number) =>
  z.string({ invalid_type_error: `${label} must be text.` }).trim().max(max, `${label} is too long.`);

/** YYYY-MM-DD that is a real date, or null ('' also means null). */
const dateOnly = (message: string) =>
  z.preprocess(
    (value) => (value === '' ? null : value),
    z
      .string({ invalid_type_error: message })
      .regex(/^\d{4}-\d{2}-\d{2}$/, message)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
      }, message)
      .nullable(),
  );

const weight = z.preprocess(
  (value) => (value === '' ? null : typeof value === 'string' ? Number(value) : value),
  z
    .number({ invalid_type_error: 'Weight must be a number.' })
    .positive('Weight must be more than 0.')
    .max(200, 'Weight looks too high.')
    .nullable(),
);

/** One DogDocument; any problem with type/name/uri -> "Documents must be images or PDFs." like the mock. */
const dogDocument = z
  .object(
    {
      id: z.string().trim().min(1).max(100).optional().catch(undefined),
      kind: z.enum(DOCUMENT_KINDS, { errorMap: () => ({ message: 'Invalid document kind.' }) }).default('vaccination'),
      name: z.string({ required_error: DOCS_TYPE, invalid_type_error: DOCS_TYPE }).trim().min(1, DOCS_TYPE).max(255),
      uri: z.string({ required_error: DOCS_TYPE, invalid_type_error: DOCS_TYPE }).trim().min(1, DOCS_TYPE).max(2048),
      mimeType: z.string({ required_error: DOCS_TYPE, invalid_type_error: DOCS_TYPE }).regex(ALLOWED_MIME, DOCS_TYPE),
      size: z.number({ invalid_type_error: 'File size must be a number.' }).nonnegative().nullable().default(null),
      uploadedAt: z
        .string()
        .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid upload date.')
        .transform((value) => new Date(value))
        .optional(),
    },
    { invalid_type_error: DOCS_TYPE },
  )
  .superRefine((doc, ctx) => {
    if (doc.size !== null && doc.size > MAX_FILE_BYTES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${doc.name} is larger than 10 MB.`, path: ['size'] });
    }
  });

const documents = z
  .array(dogDocument, { invalid_type_error: DOCS_COUNT })
  .max(MAX_DOCUMENTS, DOCS_COUNT);

/**
 * Field validators in the mock's check order (name, owner name, owner phone, gender, temperament, status,
 * documents), then the remaining fields. Zod reports the first failing key in this order.
 */
const fields = {
  name: requiredText('Dog name is required.', 60),
  ownerName: requiredText('Owner name is required.', 100),
  ownerPhone: requiredText('Owner phone is required.', 30),
  gender: enumOf(GENDERS, 'Invalid gender.'),
  temperament: enumOf(TEMPERAMENTS, 'Invalid temperament.'),
  status: enumOf(DOG_STATUSES, 'Invalid status.'),
  documents,
  breed: optionalText('Breed', 100),
  color: optionalText('Color', 60),
  dateOfBirth: dateOnly('Date of birth must be YYYY-MM-DD.'),
  weightKg: weight,
  ownerId: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().refine(isObjectId, 'Invalid owner.').nullable(),
  ),
  vaccinated: z.boolean({ invalid_type_error: 'Vaccinated must be true or false.' }),
  vaccinationExpiry: dateOnly('Vaccination expiry must be YYYY-MM-DD.'),
  neutered: z.boolean({ invalid_type_error: 'Neutered must be true or false.' }),
  feedingNotes: optionalText('Feeding notes', 2000),
  medicalNotes: optionalText('Medical notes', 2000),
  notes: optionalText('Notes', 2000),
  photoUrl: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string({ invalid_type_error: 'Enter a valid photo link.' }).trim().max(2048, 'The photo link is too long.').nullable(),
  ),
};

/** POST /dogs: required fields + defaults (spec §6.2). Unknown keys (id, createdAt, ...) are dropped. */
export const createDogBody = z.object({
  name: fields.name,
  ownerName: fields.ownerName,
  ownerPhone: fields.ownerPhone,
  gender: fields.gender.default('male'),
  temperament: fields.temperament.default('friendly'),
  status: fields.status.default('active'),
  documents: fields.documents.default([]),
  breed: fields.breed.default(''),
  color: fields.color.default(''),
  dateOfBirth: fields.dateOfBirth.default(null),
  weightKg: fields.weightKg.default(null),
  ownerId: fields.ownerId.default(null),
  vaccinated: fields.vaccinated.default(false),
  vaccinationExpiry: fields.vaccinationExpiry.default(null),
  neutered: fields.neutered.default(false),
  feedingNotes: fields.feedingNotes.default(''),
  medicalNotes: fields.medicalNotes.default(''),
  notes: fields.notes.default(''),
  photoUrl: fields.photoUrl.default(null),
});
export type CreateDogBody = z.infer<typeof createDogBody>;

/** PATCH /dogs/:id: same keys, all optional; checks apply only to fields that are sent. */
export const updateDogBody = z.object({
  name: fields.name.optional(),
  ownerName: fields.ownerName.optional(),
  ownerPhone: fields.ownerPhone.optional(),
  gender: fields.gender.optional(),
  temperament: fields.temperament.optional(),
  status: fields.status.optional(),
  documents: fields.documents.optional(),
  breed: fields.breed.optional(),
  color: fields.color.optional(),
  dateOfBirth: fields.dateOfBirth.optional(),
  weightKg: fields.weightKg.optional(),
  ownerId: fields.ownerId.optional(),
  vaccinated: fields.vaccinated.optional(),
  vaccinationExpiry: fields.vaccinationExpiry.optional(),
  neutered: fields.neutered.optional(),
  feedingNotes: fields.feedingNotes.optional(),
  medicalNotes: fields.medicalNotes.optional(),
  notes: fields.notes.optional(),
  photoUrl: fields.photoUrl.optional(),
});
export type UpdateDogBody = z.infer<typeof updateDogBody>;

/** GET /dogs query. `status` defaults to active; unknown params are ignored. */
export const listDogsQuery = z
  .object({
    status: z
      .enum(['active', 'archived', 'all'], { errorMap: () => ({ message: 'Invalid status.' }) })
      .default('active'),
    search: z.string().trim().max(100, 'Search is too long.').optional(),
  })
  .passthrough();
export type ListDogsQuery = z.infer<typeof listDogsQuery>;
