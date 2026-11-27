import { z } from 'zod';
import { isObjectId } from '../../utils/objectId.js';

const IMMUTABLE_MESSAGE =
  'A signed waiver can’t be changed. Only the linked dog and Know Your Dog form can be updated.';

const isoDate = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), message)
    .transform((value) => new Date(value));

/** GET /waivers (admin, staff). Unknown params are ignored. */
export const listWaiversQuery = z
  .object({
    search: z.string().trim().max(100, 'Search is too long.').optional(),
    from: isoDate('Enter a valid "from" date.').optional(),
    to: isoDate('Enter a valid "to" date.').optional(),
  })
  .passthrough();
export type ListWaiversQuery = z.infer<typeof listWaiversQuery>;

const linkId = (message: string) => z.string({ invalid_type_error: message }).refine(isObjectId, message).nullable().optional();

/**
 * PATCH /waivers/:id (admin). Strict: any other key (names, consents, signature, ...) is rejected,
 * because signed waivers are immutable.
 */
export const updateWaiverBody = z
  .object(
    {
      dogId: linkId('Choose an existing dog.'),
      questionnaireId: linkId('Choose an existing Know Your Dog form.'),
    },
    {
      errorMap: (issue, ctx) =>
        issue.code === z.ZodIssueCode.unrecognized_keys ? { message: IMMUTABLE_MESSAGE } : { message: ctx.defaultError },
    },
  )
  .strict();
export type UpdateWaiverBody = z.infer<typeof updateWaiverBody>;
