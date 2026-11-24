import { z } from 'zod';

/** `:id` route param. Unknown ids simply end up as 404 in the service layer. */
export const idParams = z.object({ id: z.string().trim().min(1) });

/** Enum with one friendly message for every failure (wrong value, wrong type). */
export const enumOf = <U extends string, T extends Readonly<[U, ...U[]]>>(values: T, message: string) =>
  z.enum(values, { errorMap: () => ({ message }) });
