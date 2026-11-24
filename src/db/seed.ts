import { readFile } from 'node:fs/promises';
import bcrypt from 'bcrypt';
import mongoose, { Types, type Model } from 'mongoose';
import { env } from '../config/env.js';
import { RefreshTokenModel } from '../modules/auth/refreshToken.model.js';
import { BookingModel } from '../modules/bookings/bookings.model.js';
import { DogModel } from '../modules/dogs/dogs.model.js';
import { DEFAULT_SETTINGS, SETTINGS_ID, SettingsModel } from '../modules/settings/settings.model.js';
import { UserModel } from '../modules/users/users.model.js';
import { addLocalDays, localDaysBetween, parseDateKey } from '../utils/time.js';

/** seed/ holds a copy of PawsNPlayRender/mock/data/*.json (spec §10). Resolves from src/db and dist/db alike. */
export const SEED_DIR = new URL('../../seed/', import.meta.url);
/** The date the seed bookings are built around (spec §10). */
export const SEED_REFERENCE_DATE = '2026-11-23';

type Json = Record<string, unknown>;
type SeedRecord = { id: string } & Json;
interface SeedPayment extends Json {
  id: string;
  receivedAt: string;
  recordedBy: string;
}
interface SeedBooking extends SeedRecord {
  dogId: string;
  createdBy: string;
  checkIn: string;
  checkOut: string;
  payments: SeedPayment[];
}

export const SEED_FILES = ['users', 'dogs', 'bookings', 'settings'] as const;
export type SeedName = (typeof SEED_FILES)[number];

export async function loadSeedFile<T = unknown>(name: SeedName): Promise<T> {
  return JSON.parse(await readFile(new URL(`${name}.json`, SEED_DIR), 'utf8')) as T;
}

/** Seed users share one password, so each distinct password is hashed once per process. */
const hashCache = new Map<string, Promise<string>>();
const hashSeedPassword = (password: string): Promise<string> => {
  const cached = hashCache.get(password);
  if (cached) return cached;
  const hash: Promise<string> = bcrypt.hash(password, env.BCRYPT_COST);
  hashCache.set(password, hash);
  return hash;
};

/** Collections left over from the old pet-care schema; dropped by the seed if they exist. */
const LEGACY_COLLECTIONS = ['pets', 'services', 'notifications', 'refreshtokens'];

export interface SeedOptions {
  /** Shift every booking/payment date by this many local days (seed --shift-to-today). */
  shiftDays?: number;
}

export interface SeedResult {
  counts: Record<'users' | 'dogs' | 'bookings' | 'settings', number>;
  /** Mock id (u_001, d_001, b_001, p_001) -> new ObjectId hex. */
  ids: Record<string, string>;
  shiftDays: number;
}

/** Days from the seed reference date (23 Nov 2026) to today, in the facility timezone. */
export function daysSinceSeedReference(today: Date, tz: string = DEFAULT_SETTINGS.timezone): number {
  const reference = parseDateKey(SEED_REFERENCE_DATE, tz) as Date;
  return localDaysBetween(reference, today, tz);
}

/** Validates each document with Mongoose, then inserts raw so the seed's createdAt/updatedAt are kept. */
async function insertValidated<T>(model: Model<T>, docs: Json[]): Promise<void> {
  if (docs.length === 0) return;
  const hydrated = docs.map((doc) => new model(doc));
  await Promise.all(hydrated.map((doc) => doc.validate()));
  await model.collection.insertMany(hydrated.map((doc) => doc.toObject({ transform: false })));
}

/**
 * Drops the Phase 1 data and loads seed/*.json (spec §10): bcrypt password hashes, mock ids mapped to new
 * ObjectIds with dogId/createdBy/recordedBy/ownerId rewritten, settings as the single document.
 * DESTRUCTIVE - callers must refuse production / non-local databases. Caller must already be connected.
 */
export async function seedDatabase({ shiftDays = 0 }: SeedOptions = {}): Promise<SeedResult> {
  const [users, dogs, bookings, settings] = await Promise.all([
    loadSeedFile<Array<SeedRecord & { password: string }>>('users'),
    loadSeedFile<SeedRecord[]>('dogs'),
    loadSeedFile<SeedBooking[]>('bookings'),
    loadSeedFile<Json>('settings'),
  ]);
  const tz = typeof settings.timezone === 'string' ? settings.timezone : DEFAULT_SETTINGS.timezone;

  const ids = new Map<string, Types.ObjectId>();
  const idFor = (mockId: string) => {
    let id = ids.get(mockId);
    if (!id) {
      id = new Types.ObjectId();
      ids.set(mockId, id);
    }
    return id;
  };
  const ref = (mockId: unknown) => {
    if (typeof mockId !== 'string' || !mockId) return null;
    const id = ids.get(mockId);
    if (!id) throw new Error(`Seed data refers to unknown id "${mockId}".`);
    return id;
  };
  const shift = (iso: string) => {
    const date = new Date(iso);
    return shiftDays ? addLocalDays(date, shiftDays, tz) : date;
  };

  const userDocs = await Promise.all(
    users.map(async ({ id, password, createdAt, updatedAt, ...user }) => ({
      ...user,
      _id: idFor(id),
      passwordHash: await hashSeedPassword(password),
      tokenVersion: 0,
      createdAt: new Date(String(createdAt)),
      updatedAt: new Date(String(updatedAt ?? createdAt)),
    })),
  );
  const dogDocs = dogs.map(({ id, ownerId, documents, createdAt, updatedAt, ...dog }) => ({
    ...dog,
    _id: idFor(id),
    ownerId: ownerId ? ref(ownerId) : null,
    documents: ((documents as Json[] | undefined) ?? []).map(({ id: docId, uploadedAt, ...doc }) => ({
      ...doc,
      _id: String(docId ?? new Types.ObjectId().toHexString()),
      uploadedAt: new Date(String(uploadedAt)),
    })),
    createdAt: new Date(String(createdAt)),
    updatedAt: new Date(String(updatedAt ?? createdAt)),
  }));
  const bookingDocs = bookings.map(
    ({ id, dogId, createdBy, checkIn, checkOut, payments, createdAt, updatedAt, ...booking }) => ({
      ...booking,
      _id: idFor(id),
      dogId: ref(dogId),
      createdBy: ref(createdBy),
      checkIn: shift(checkIn),
      checkOut: shift(checkOut),
      payments: payments.map(({ id: paymentId, receivedAt, recordedBy, ...payment }) => ({
        ...payment,
        _id: idFor(paymentId),
        receivedAt: shift(receivedAt),
        recordedBy: ref(recordedBy),
      })),
      statusHistory: [],
      createdAt: shift(String(createdAt)),
      updatedAt: shift(String(updatedAt ?? createdAt)),
    }),
  );

  const existing = new Set((await mongoose.connection.db?.listCollections({}, { nameOnly: true }).toArray())?.map((c) => c.name));
  await Promise.all([
    ...LEGACY_COLLECTIONS.filter((name) => existing.has(name)).map((name) => mongoose.connection.dropCollection(name)),
    RefreshTokenModel.deleteMany({}),
    UserModel.deleteMany({}),
    DogModel.deleteMany({}),
    BookingModel.deleteMany({}),
    SettingsModel.deleteMany({}),
  ]);

  await insertValidated(UserModel, userDocs);
  await insertValidated(DogModel, dogDocs);
  await insertValidated(BookingModel, bookingDocs);
  const at = new Date();
  await insertValidated(SettingsModel, [
    { ...DEFAULT_SETTINGS, ...settings, _id: SETTINGS_ID, lockedUntil: null, lockOwner: null, createdAt: at, updatedAt: at },
  ]);

  // Make sure the indexes declared in the models exist (and drop ones from the old schema).
  await Promise.all([
    RefreshTokenModel.syncIndexes(),
    UserModel.syncIndexes(),
    DogModel.syncIndexes(),
    BookingModel.syncIndexes(),
    SettingsModel.syncIndexes(),
  ]);

  const [userCount, dogCount, bookingCount, settingsCount] = await Promise.all([
    UserModel.countDocuments(),
    DogModel.countDocuments(),
    BookingModel.countDocuments(),
    SettingsModel.countDocuments(),
  ]);
  return {
    counts: { users: userCount, dogs: dogCount, bookings: bookingCount, settings: settingsCount },
    ids: Object.fromEntries([...ids].map(([mockId, id]) => [mockId, id.toHexString()])),
    shiftDays,
  };
}
