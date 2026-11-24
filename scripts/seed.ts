/**
 * npm run seed [-- --shift-to-today] [-- --force]
 * Drops the Phase 1 collections (users, dogs, bookings, settings, refreshTokens) and loads seed/*.json.
 * Refuses NODE_ENV=production, and non-local MongoDB URIs unless --force.
 * --shift-to-today moves every booking/payment date by (today - 2026-11-23) days for a lively dashboard.
 */
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/db/connect.js';
import { daysSinceSeedReference, seedDatabase } from '../src/db/seed.js';

const LOCAL_URI = /^mongodb:\/\/(?:[^@/]*@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/;

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to seed: NODE_ENV is production.');
    process.exitCode = 1;
    return;
  }
  if (!LOCAL_URI.test(env.MONGODB_URI) && !process.argv.includes('--force')) {
    console.error('Refusing to seed: MONGODB_URI is not a local database. Use --force if you are sure.');
    process.exitCode = 1;
    return;
  }

  const shiftDays = process.argv.includes('--shift-to-today') ? daysSinceSeedReference(new Date()) : 0;
  await connectDB();
  try {
    const { counts } = await seedDatabase({ shiftDays });
    console.log('Seed complete:');
    for (const [name, count] of Object.entries(counts)) console.log(`  ${name.padEnd(10)} ${count}`);
    if (shiftDays) console.log(`  Booking and payment dates shifted by ${shiftDays} day(s) to match today.`);
    console.log('  Logins (password123): kush@pawsnplay.com (admin), neha.staff@pawsnplay.com (staff)');
  } finally {
    await disconnectDB();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
