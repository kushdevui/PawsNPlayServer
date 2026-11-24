import type { Role, UserStatus } from '../auth/roles.js';
import type { UserDoc } from './users.model.js';

/** App `User` (spec §6.1 User JSON). Never includes passwordHash or tokenVersion. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  createdAt: Date;
}

export const serializeUser = (u: Pick<UserDoc, keyof Omit<PublicUser, 'id'> | '_id'>): PublicUser => ({
  id: u._id.toHexString(),
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone ?? null,
  avatarUrl: u.avatarUrl ?? null,
  status: u.status,
  createdAt: u.createdAt,
});
