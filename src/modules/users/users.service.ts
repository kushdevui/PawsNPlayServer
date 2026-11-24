import type { FilterQuery, HydratedDocument } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import type { Pagination } from '../../utils/pagination.js';
import { revokeAllSessions } from '../auth/auth.service.js';
import type { ListUsersQuery, UpdateUserBody } from './users.schema.js';
import { UserModel, type UserDoc } from './users.model.js';

type UserDocument = HydratedDocument<UserDoc>;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Filters role, status and search (name or email, case-insensitive); oldest first like the seed order. */
export async function listUsers(
  { role, status, search }: ListUsersQuery,
  { skip, limit }: Pagination,
): Promise<{ items: UserDocument[]; total: number }> {
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
  return { items, total };
}

export async function getUser(id: string): Promise<UserDocument> {
  const user = await UserModel.findById(id);
  if (!user) throw AppError.notFound('User');
  return user;
}

export async function updateUser(id: string, { role, status }: UpdateUserBody): Promise<UserDocument> {
  const update: UpdateUserBody = {};
  if (role) update.role = role;
  if (status) update.status = status;

  const user =
    Object.keys(update).length === 0
      ? await UserModel.findById(id)
      : await UserModel.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
  if (!user) throw AppError.notFound('User');

  // A deactivated user loses every session; their access tokens already fail in requireAuth.
  if (update.status === 'inactive') await revokeAllSessions(user._id);
  return user;
}
