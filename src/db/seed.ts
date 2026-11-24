import { readFile } from 'node:fs/promises';
import bcrypt from 'bcrypt';
import { RefreshTokenModel } from '../modules/auth/refreshToken.model.js';
import { BookingModel } from '../modules/bookings/bookings.model.js';
import { NotificationModel } from '../modules/notifications/notifications.model.js';
import { PetModel } from '../modules/pets/pets.model.js';
import { ServiceModel } from '../modules/services/services.model.js';
import { UserModel } from '../modules/users/users.model.js';

/** seed/ holds a copy of PawsNPlayRender/mock/data/*.json. Resolves from src/db and dist/db alike. */
export const SEED_DIR = new URL('../../seed/', import.meta.url);
export const BCRYPT_COST = 10;

type SeedRecord = { id: string } & Record<string, unknown>;
type SeedUser = SeedRecord & { password: string };

export const SEED_FILES = ['users', 'pets', 'services', 'bookings', 'notifications'] as const;
export type SeedName = (typeof SEED_FILES)[number];

export async function loadSeedFile<T extends SeedRecord = SeedRecord>(name: SeedName): Promise<T[]> {
  const raw = await readFile(new URL(`${name}.json`, SEED_DIR), 'utf8');
  return JSON.parse(raw) as T[];
}

/** `id` -> `_id` so the seed ids (u_001, p_001, ...) are kept as the document ids. */
const withMongoId = ({ id, ...rest }: SeedRecord) => ({ _id: id, ...rest });

/**
 * Seed users share one password, so each distinct password is hashed once per process
 * (keeps repeated seeding in tests fast). The hash is still a normal bcrypt hash.
 */
const hashCache = new Map<string, Promise<string>>();
const hashSeedPassword = (password: string): Promise<string> => {
  const cached = hashCache.get(password);
  if (cached) return cached;
  const hash: Promise<string> = bcrypt.hash(password, BCRYPT_COST);
  hashCache.set(password, hash);
  return hash;
};

export type SeedCounts = Record<SeedName, number>;

/**
 * Wipes the five collections (and all refresh tokens, so old sessions end) and inserts the seed data. Caller must already be connected.
 * DESTRUCTIVE - only for local/test databases.
 */
export async function seedDatabase(): Promise<SeedCounts> {
  const [users, pets, services, bookings, notifications] = await Promise.all([
    loadSeedFile<SeedUser>('users'),
    loadSeedFile('pets'),
    loadSeedFile('services'),
    loadSeedFile('bookings'),
    loadSeedFile('notifications'),
  ]);

  const userDocs = await Promise.all(
    users.map(async ({ password, ...user }) => ({
      ...withMongoId(user),
      passwordHash: await hashSeedPassword(password),
    })),
  );

  await Promise.all([
    RefreshTokenModel.deleteMany({}),
    UserModel.deleteMany({}),
    PetModel.deleteMany({}),
    ServiceModel.deleteMany({}),
    BookingModel.deleteMany({}),
    NotificationModel.deleteMany({}),
  ]);

  await UserModel.insertMany(userDocs);
  await PetModel.insertMany(pets.map(withMongoId));
  await ServiceModel.insertMany(services.map(withMongoId));
  await BookingModel.insertMany(bookings.map(withMongoId));
  await NotificationModel.insertMany(notifications.map(withMongoId));

  // Make sure the indexes declared in the models exist (unique email, filter indexes).
  await Promise.all([
    RefreshTokenModel.syncIndexes(),
    UserModel.syncIndexes(),
    PetModel.syncIndexes(),
    ServiceModel.syncIndexes(),
    BookingModel.syncIndexes(),
    NotificationModel.syncIndexes(),
  ]);

  const [userCount, petCount, serviceCount, bookingCount, notificationCount] = await Promise.all([
    UserModel.countDocuments(),
    PetModel.countDocuments(),
    ServiceModel.countDocuments(),
    BookingModel.countDocuments(),
    NotificationModel.countDocuments(),
  ]);
  return {
    users: userCount,
    pets: petCount,
    services: serviceCount,
    bookings: bookingCount,
    notifications: notificationCount,
  };
}
