/**
 * The single source of truth for roles. Adding a role means updating this list, every affected
 * route's role list and visibility rule, docs/, and the app (PawsNPlayRender src/api/types.ts).
 */
export const ROLES = ['admin', 'user', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['active', 'inactive'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);
