import { randomUUID } from 'node:crypto';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { BookingModel } from '../bookings/bookings.model.js';
import { DEFAULT_SETTINGS, SETTINGS_ID, SettingsModel, type SettingsDoc } from './settings.model.js';
import type { UpdateSettingsBody } from './settings.schema.js';

/** App `FacilitySettings` (spec §6.4): exactly these fields. */
export interface FacilitySettings {
  facilityName: string;
  capacity: number;
  defaultCheckInTime: string;
  defaultCheckOutTime: string;
  pricePerNight: number;
  currency: string;
  timezone: string;
}

export const serializeSettings = (s: FacilitySettings): FacilitySettings => ({
  facilityName: s.facilityName,
  capacity: s.capacity,
  defaultCheckInTime: s.defaultCheckInTime,
  defaultCheckOutTime: s.defaultCheckOutTime,
  pricePerNight: s.pricePerNight,
  currency: s.currency,
  timezone: s.timezone,
});

/** The settings document, created with defaults on first use (fixed _id, so the upsert is race-safe). */
export async function loadSettings(): Promise<SettingsDoc> {
  const existing = await SettingsModel.findById(SETTINGS_ID).lean<SettingsDoc>();
  if (existing) return existing;
  const created = await SettingsModel.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { ...DEFAULT_SETTINGS, lockedUntil: null, lockOwner: null } },
    { upsert: true, new: true },
  ).lean<SettingsDoc>();
  return created as SettingsDoc;
}

export async function getSettings(): Promise<FacilitySettings> {
  return serializeSettings(await loadSettings());
}

const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 10_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Facility-wide lock for "check, then write" sequences (spec §8.2 concurrency): booking create/edit, check-in,
 * payments and capacity changes. A lease on the settings document, so it works on a standalone MongoDB and
 * across several API instances. A crashed holder's lease expires after LOCK_TTL_MS.
 */
export async function withFacilityLock<T>(work: () => Promise<T>): Promise<T> {
  await loadSettings();
  const owner = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (let attempt = 0; ; attempt += 1) {
    const now = new Date();
    const acquired = await SettingsModel.findOneAndUpdate(
      { _id: SETTINGS_ID, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_TTL_MS), lockOwner: owner } },
      { new: true, timestamps: false, projection: { _id: 1 } },
    );
    if (acquired) break;
    if (Date.now() > deadline) {
      throw new AppError(503, 'BUSY', 'The server is busy. Please try again.');
    }
    await sleep(Math.min(25 * 2 ** Math.min(attempt, 4), 250));
  }
  try {
    return await work();
  } finally {
    await SettingsModel.updateOne(
      { _id: SETTINGS_ID, lockOwner: owner },
      { $set: { lockedUntil: null, lockOwner: null } },
      { timestamps: false },
    ).catch((err: unknown) => logger.error({ err }, 'Could not release the facility lock'));
  }
}

/** PATCH /settings (spec §7.7). currency/timezone are not editable (the schema drops them). */
export async function updateSettings(changes: UpdateSettingsBody): Promise<FacilitySettings> {
  return withFacilityLock(async () => {
    if (changes.capacity !== undefined) {
      const checkedIn = await BookingModel.countDocuments({ status: 'checked_in' });
      if (changes.capacity < checkedIn) {
        throw AppError.rule(
          'CAPACITY_BELOW_OCCUPANCY',
          `${checkedIn} dogs are checked in right now. Capacity can't be lower than that.`,
          { checkedIn },
        );
      }
    }
    const update = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    if (Object.keys(update).length === 0) return getSettings();
    const doc = await SettingsModel.findOneAndUpdate(
      { _id: SETTINGS_ID },
      { $set: update },
      { new: true, runValidators: true },
    ).lean<SettingsDoc>();
    return serializeSettings(doc ?? (await loadSettings()));
  });
}
