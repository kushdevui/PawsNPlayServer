import { randomUUID } from 'node:crypto';

/** Prefixes match the seed data: u_001, p_001, s_001, b_001, n_001. `rt` = refresh token. */
export type IdPrefix = 'u' | 'p' | 's' | 'b' | 'n' | 'rt';

/** New string id such as `u_3f9a1c2b7d4e` (12 hex chars from a random UUID). */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
