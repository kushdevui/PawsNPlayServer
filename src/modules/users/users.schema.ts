import { z } from 'zod';
import { ROLES, USER_STATUSES } from '../auth/roles.js';

const role = z.enum(ROLES, { errorMap: () => ({ message: 'Invalid role.' }) });
const status = z.enum(USER_STATUSES, { errorMap: () => ({ message: 'Invalid status.' }) });

/** page/limit pass through untouched and are read leniently by parsePagination. */
export const listUsersQuery = z
  .object({
    role: role.optional(),
    status: status.optional(),
    search: z.string().trim().max(100, 'Search is too long.').optional(),
  })
  .passthrough();
export type ListUsersQuery = z.infer<typeof listUsersQuery>;

export const userIdParams = z.object({ id: z.string().min(1) });

/** Admin may change role and status only; anything else in the body is ignored. */
export const updateUserBody = z.object({
  role: role.optional(),
  status: status.optional(),
});
export type UpdateUserBody = z.infer<typeof updateUserBody>;
