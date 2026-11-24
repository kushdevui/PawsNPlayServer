import type { FilterQuery, HydratedDocument } from 'mongoose';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { Pagination } from '../../utils/pagination.js';
import { NotificationModel, type NotificationDoc } from './notifications.model.js';
import type { ListNotificationsQuery } from './notifications.schema.js';

type NotificationDocument = HydratedDocument<NotificationDoc>;

// TODO(contract): confirm with app - which events create notifications server-side (booking confirmed,
// staff assigned, ...). Out of scope for now; only the seed data exists.

/** Own notifications only, newest first; `unread=true` -> read: false, `unread=false` -> read: true. */
export async function listNotifications(
  caller: AuthUser,
  { unread }: ListNotificationsQuery,
  { skip, limit }: Pagination,
): Promise<{ items: NotificationDocument[]; total: number }> {
  const filter: FilterQuery<NotificationDoc> = { userId: caller.id };
  if (unread !== undefined) filter.read = !unread;

  const [items, total] = await Promise.all([
    NotificationModel.find(filter).sort({ createdAt: -1, _id: 1 }).skip(skip).limit(limit),
    NotificationModel.countDocuments(filter),
  ]);
  return { items, total };
}

/** Someone else's notification is "not found". Marking an already read one is a no-op. */
export async function markRead(caller: AuthUser, id: string): Promise<NotificationDocument> {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: id, userId: caller.id },
    { $set: { read: true } },
    { new: true },
  );
  if (!notification) throw AppError.notFound('Notification');
  return notification;
}
