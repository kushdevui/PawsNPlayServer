/**
 * npm run seed - resets the local database to the seed data in seed/.
 * Wipes users, pets, services, bookings and notifications. Refuses non-local URIs unless --force.
 */
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/db/connect.js';
import { seedDatabase } from '../src/db/seed.js';

const LOCAL_URI = /^mongodb:\/\/(?:[^@/]*@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/;

async function main(): Promise<void> {
  if (!LOCAL_URI.test(env.MONGODB_URI) && !process.argv.includes('--force')) {
    console.error('Refusing to seed: MONGODB_URI is not a local database. Use --force if you are sure.');
    process.exitCode = 1;
    return;
  }

  await connectDB();
  try {
    const counts = await seedDatabase();
    console.log('Seed complete:');
    for (const [name, count] of Object.entries(counts)) console.log(`  ${name.padEnd(14)} ${count}`);
  } finally {
    await disconnectDB();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
