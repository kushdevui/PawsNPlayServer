import type { FilterQuery } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { isObjectId } from '../../utils/objectId.js';
import type { Pagination } from '../../utils/pagination.js';
import { revokeAllSessions } from '../auth/auth.service.js';
import type { ListUsersQuery, UpdateUserBody } from './users.schema.js';
import { UserModel, type UserDoc } from './users.model.js';
import { serializeUser, type PublicUser } from './users.serializer.js';
import { escapeRegex } from '../../utils/regex.js';

/** Filters role, status and search (name or email, case-insensitive); oldest first like the seed order. */
export async function listUsers(
  { role, status, search }: ListUsersQuery,
  { skip, limit }: Pagination,
): Promise<{ items: PublicUser[]; total: number }> {
  const filter: FilterQuery<UserDoc> = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [items, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit),
    UserModel.countDocuments(filter),
  ]);
  return { items: items.map(serializeUser), total };
}

export async function getUser(id: string): Promise<PublicUser> {
  const user = isObjectId(id) ? await UserModel.findById(id) : null;
  if (!user) throw AppError.notFound('User');
  return serializeUser(user);
}

export async function updateUser(id: string, { role, status }: UpdateUserBody): Promise<PublicUser> {
  if (!isObjectId(id)) throw AppError.notFound('User');
  const update: UpdateUserBody = {};
  if (role) update.role = role;
  if (status) update.status = status;

  const user =
    Object.keys(update).length === 0
      ? await UserModel.findById(id)
      : await UserModel.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
  if (!user) throw AppError.notFound('User');

  // Spec §7.3: deactivating revokes every token (tokenVersion bump + refresh tokens deleted).
  if (update.status === 'inactive') await revokeAllSessions(user._id.toHexString());
  return serializeUser(user);
}
