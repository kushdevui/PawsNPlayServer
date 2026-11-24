import { Schema, model } from 'mongoose';

export const SETTINGS_ID = 'facility';
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Defaults from spec §6.4. */
export const DEFAULT_SETTINGS = {
  facilityName: "Paws N' Play Boarding",
  capacity: 15,
  defaultCheckInTime: '10:00',
  defaultCheckOutTime: '18:00',
  pricePerNight: 1200,
  currency: 'INR',
  timezone: 'Asia/Kolkata',
} as const;

/**
 * The single settings document (fixed `_id` so concurrent first reads cannot create two).
 * `lockedUntil`/`lockOwner` are the booking lock (§8.2 concurrency) - internal, never returned.
 */
export interface SettingsDoc {
  _id: string;
  facilityName: string;
  capacity: number;
  defaultCheckInTime: string;
  defaultCheckOutTime: string;
  pricePerNight: number;
  currency: string;
  timezone: string;
  lockedUntil: Date | null;
  lockOwner: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<SettingsDoc>(
  {
    _id: { type: String, default: SETTINGS_ID },
    facilityName: { type: String, required: true, trim: true, default: DEFAULT_SETTINGS.facilityName },
    capacity: { type: Number, required: true, min: 1, max: 500, default: DEFAULT_SETTINGS.capacity },
    defaultCheckInTime: { type: String, match: TIME_OF_DAY, default: DEFAULT_SETTINGS.defaultCheckInTime },
    defaultCheckOutTime: { type: String, match: TIME_OF_DAY, default: DEFAULT_SETTINGS.defaultCheckOutTime },
    pricePerNight: { type: Number, min: 0, default: DEFAULT_SETTINGS.pricePerNight },
    currency: { type: String, default: DEFAULT_SETTINGS.currency },
    timezone: { type: String, default: DEFAULT_SETTINGS.timezone },
    lockedUntil: { type: Date, default: null },
    lockOwner: { type: String, default: null },
  },
  { versionKey: false, timestamps: true, collection: 'settings' },
);

export const SettingsModel = model<SettingsDoc>('Settings', settingsSchema);
