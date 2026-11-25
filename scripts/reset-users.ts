/**
 * npm run reset-users -- --email you@example.com [--name "Your Name"] --yes
 *
 * DELETES EVERY USER (and all login sessions), then creates one active admin with the given email.
 * The password is read from ADMIN_PASSWORD if set, otherwise asked for in the terminal.
 * It is never logged. Refuses NODE_ENV=production.
 *
 * Note: dogs and bookings are kept; their createdBy / recordedBy may point to users that no longer exist.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/db/connect.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { RefreshTokenModel } from '../src/modules/auth/refreshToken.model.js';
import { UserModel } from '../src/modules/users/users.model.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function askPassword(): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question('Password for the new admin: ')).trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to run: NODE_ENV is production.');
    process.exitCode = 1;
    return;
  }
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim() || 'Kush';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run reset-users -- --email you@example.com [--name "Your Name"] --yes');
    process.exitCode = 1;
    return;
  }
  if (!process.argv.includes('--yes')) {
    console.error(`This deletes ALL users and sessions, then creates ${email} as the only admin.`);
    console.error('Add --yes to confirm.');
    process.exitCode = 1;
    return;
  }

  const password = process.env.ADMIN_PASSWORD ?? (await askPassword());
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  await connectDB();
  try {
    const passwordHash = await hashPassword(password);
    const removedSessions = await RefreshTokenModel.deleteMany({});
    const removedUsers = await UserModel.deleteMany({});
    await UserModel.create({ name, email, passwordHash, role: 'admin', status: 'active' });
    console.log(`Removed ${removedUsers.deletedCount} user(s) and ${removedSessions.deletedCount} session(s).`);
    console.log(`Created admin: ${email}. Log in with the password you entered.`);
  } finally {
    await disconnectDB();
  }
}

main().catch((err: unknown) => {
  console.error('Reset failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
