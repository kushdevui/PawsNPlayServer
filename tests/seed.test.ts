import { describe, expect, it } from 'vitest';
import { daysSinceSeedReference, loadSeedFile } from '../src/db/seed.js';
import { BookingModel } from '../src/modules/bookings/bookings.model.js';
import { DogModel } from '../src/modules/dogs/dogs.model.js';
import { SettingsModel } from '../src/modules/settings/settings.model.js';
import { UserModel } from '../src/modules/users/users.model.js';
import { seed } from './helpers.js';

describe('seedDatabase (spec §10)', () => {
  it('loads every record and the single settings document', async () => {
    const { counts } = await seed();
    expect(counts).toEqual({ users: 8, dogs: 12, bookings: 17, settings: 1 });
    expect(await SettingsModel.findById('facility').lean()).toMatchObject({ capacity: 15, timezone: 'Asia/Kolkata' });
  });

  it('maps mock ids to ObjectIds and rewrites dogId / createdBy / recordedBy', async () => {
    const { id } = await seed();
    const b004 = await BookingModel.findById(id('b_004')).lean();
    expect(b004?.dogId.toHexString()).toBe(id('d_002'));
    expect(b004?.createdBy.toHexString()).toBe(id('u_001'));
    expect(b004?.payments[0]?._id.toHexString()).toBe(id('p_007'));
    expect(b004?.payments[0]?.recordedBy.toHexString()).toBe(id('u_001'));
    expect(b004?.createdAt.toISOString()).toBe('2026-10-01T03:30:00.000Z'); // seed timestamps kept
  });

  it('stores bcrypt hashes, never plain passwords', async () => {
    await seed();
    const kush = await UserModel.findOne({ email: 'kush@pawsnplay.com' }).lean();
    expect(kush?.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(kush).not.toHaveProperty('password');
  });

  it('can run twice', async () => {
    await seed();
    const { counts } = await seed();
    expect(counts.bookings).toBe(17);
    expect(await DogModel.countDocuments()).toBe(12);
  });

  it('--shift-to-today shifts booking and payment dates by whole local days', async () => {
    const shiftDays = 10;
    const { id } = await seed({ shiftDays });
    const raw = (await loadSeedFile<Array<{ id: string; checkIn: string; payments: Array<{ receivedAt: string }> }>>('bookings')).find(
      (b) => b.id === 'b_004',
    );
    const b004 = await BookingModel.findById(id('b_004')).lean();
    const day = 24 * 60 * 60 * 1000;
    expect(b004!.checkIn.getTime() - new Date(raw!.checkIn).getTime()).toBe(shiftDays * day);
    expect(b004!.payments[0]!.receivedAt.getTime() - new Date(raw!.payments[0]!.receivedAt).getTime()).toBe(shiftDays * day);
  });

  it('daysSinceSeedReference counts local (IST) calendar days from 2026-11-23', () => {
    expect(daysSinceSeedReference(new Date('2026-11-23T14:00:00.000Z'))).toBe(0);
    expect(daysSinceSeedReference(new Date('2026-11-23T19:00:00.000Z'))).toBe(1); // 00:30 IST on 24 Nov
    expect(daysSinceSeedReference(new Date('2026-12-01T06:00:00.000Z'))).toBe(8);
  });
});
