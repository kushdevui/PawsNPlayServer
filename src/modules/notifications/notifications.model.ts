import { Schema, model } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';
import { newId } from '../../utils/ids.js';

export const NOTIFICATION_TYPES = ['booking', 'promo', 'reminder', 'assignment', 'system'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Stored shape. Public shape = app `AppNotification`. */
export interface NotificationDoc {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  data: Record<string, string> | null;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    _id: { type: String, default: () => newId('n') },
    userId: { type: String, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false },
    data: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { ...baseSchemaOptions, collection: 'notifications', minimize: false },
);

// Own notifications, newest first, optionally filtered by read.
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const NotificationModel = model<NotificationDoc>('Notification', notificationSchema);
