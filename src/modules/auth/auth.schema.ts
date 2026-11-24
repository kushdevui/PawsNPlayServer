import { z } from 'zod';

/** Like the app mock: missing/odd values are not a 422 here, they simply fail as INVALID_CREDENTIALS. */
export const loginBody = z
  .object({
    email: z.string().trim().toLowerCase().catch(''),
    password: z.string().catch(''),
  })
  .catch({ email: '', password: '' });
export type LoginBody = z.infer<typeof loginBody>;

const REQUIRED_MESSAGE = 'Name, email and password are required.';

export const registerBody = z.object({
  name: z
    .string({ required_error: REQUIRED_MESSAGE, invalid_type_error: REQUIRED_MESSAGE })
    .trim()
    .min(1, REQUIRED_MESSAGE)
    .max(100, 'Name is too long.'),
  email: z
    .string({ required_error: REQUIRED_MESSAGE, invalid_type_error: REQUIRED_MESSAGE })
    .trim()
    .toLowerCase()
    .min(1, REQUIRED_MESSAGE)
    .email('Enter a valid email address.'),
  password: z
    .string({ required_error: REQUIRED_MESSAGE, invalid_type_error: REQUIRED_MESSAGE })
    .min(1, REQUIRED_MESSAGE)
    // Spec §7.2/§9: minimum 8 characters.
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
  phone: z
    .string({ invalid_type_error: 'Enter a valid phone number.' })
    .trim()
    .max(30, 'Enter a valid phone number.')
    .nullish()
    .transform((value) => value || null),
});
export type RegisterBody = z.infer<typeof registerBody>;

/** Like the app mock: a missing token is just an invalid token (401 INVALID_TOKEN). */
export const refreshBody = z.object({ refreshToken: z.string().catch('') }).catch({ refreshToken: '' });
export type RefreshBody = z.infer<typeof refreshBody>;

/** The app sends no body; then every session of the user is ended. */
export const logoutBody = z
  .object({ refreshToken: z.string().min(1).optional().catch(undefined) })
  .catch({ refreshToken: undefined });
export type LogoutBody = z.infer<typeof logoutBody>;

export const updateMeBody = z.object({
  name: z
    .string({ invalid_type_error: 'Name must be text.' })
    .trim()
    .min(1, 'Name cannot be empty.')
    .max(100, 'Name is too long.')
    .optional(),
  phone: z
    .string({ invalid_type_error: 'Enter a valid phone number.' })
    .trim()
    .max(30, 'Enter a valid phone number.')
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
  avatarUrl: z
    .string({ invalid_type_error: 'Enter a valid image link.' })
    .trim()
    .max(2048, 'The image link is too long.')
    .nullable()
    .optional(),
});
export type UpdateMeBody = z.infer<typeof updateMeBody>;
