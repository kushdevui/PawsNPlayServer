import { beforeAll, describe, expect, it } from 'vitest';
import { loadSeedFile, seedDatabase, SEED_FILES, type SeedCounts } from '../src/db/seed.js';
import { BookingModel } from '../src/modules/bookings/bookings.model.js';
import { NotificationModel } from '../src/modules/notifications/notifications.model.js';
import { PetModel } from '../src/modules/pets/pets.model.js';
import { ServiceModel } from '../src/modules/services/services.model.js';
import { UserModel } from '../src/modules/users/users.model.js';

/** Round-trip through JSON exactly like res.json() does. */
const asJson = (doc: { toJSON(): unknown }) => JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;

let counts: SeedCounts;

beforeAll(async () => {
  counts = await seedDatabase();
});

describe('seedDatabase', () => {
  it('inserts every record from seed/*.json', async () => {
    for (const name of SEED_FILES) {
      const records = await loadSeedFile(name);
      expect(counts[name]).toBe(records.length);
    }
  });

  it('can be run twice (wipes before inserting)', async () => {
    const again = await seedDatabase();
    expect(again).toEqual(counts);
  });

  it('hashes passwords and never stores the plain one', async () => {
    const user = await UserModel.findById('u_001').lean();
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(user).not.toHaveProperty('password');
  });
});

describe('toJSON matches the app types (src/api/types.ts)', () => {
  it('User: same as seed minus password, no passwordHash/_id/__v', async () => {
    const [seedUser] = await loadSeedFile('users');
    const { password: _password, ...expected } = seedUser!;
    const user = await UserModel.findById(expected.id);

    expect(asJson(user!)).toEqual(expected);
  });

  it.each([
    ['pets', PetModel],
    ['services', ServiceModel],
    ['bookings', BookingModel],
    ['notifications', NotificationModel],
  ] as const)('%s: identical to the seed record', async (name, Model) => {
    const records = await loadSeedFile(name);
    for (const record of records) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- union of model types
      const doc = await (Model as any).findById(record.id);
      expect(asJson(doc)).toEqual(record);
    }
  });
});

describe('new documents', () => {
  it('get a prefixed string id and createdAt', async () => {
    const pet = await PetModel.create({
      ownerId: 'u_002',
      name: 'Tiger',
      species: 'cat',
      breed: 'Indie',
      gender: 'male',
      dateOfBirth: '2024-02-01',
      weightKg: 3.1,
    });
    const json = asJson(pet);

    expect(json.id).toMatch(/^p_[0-9a-f]{12}$/);
    expect(typeof json.createdAt).toBe('string');
    expect(json).toMatchObject({ vaccinated: false, notes: '', photoUrl: null });
    expect(json).not.toHaveProperty('_id');
    expect(json).not.toHaveProperty('__v');
  });

  it('lowercases emails and enforces uniqueness', async () => {
    await expect(
      UserModel.create({ name: 'Dup', email: 'PRIYA@example.com', passwordHash: 'x' }),
    ).rejects.toThrow(/duplicate key/);
  });
});
