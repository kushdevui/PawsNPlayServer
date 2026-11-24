import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { seedDatabase, type SeedResult } from '../src/db/seed.js';
import { signAccessToken } from '../src/modules/auth/tokens.js';
import { UserModel } from '../src/modules/users/users.model.js';
import { setNow } from '../src/utils/clock.js';

export const app = createApp();

export const PASSWORD = 'password123';
/** Seed logins (spec §10). */
export const EMAILS = {
  admin: 'kush@pawsnplay.com', // u_001
  admin2: 'divya@pawsnplay.com', // u_007
  staff: 'neha.staff@pawsnplay.com', // u_004
  user: 'priya@example.com', // u_002
  inactive: 'ananya@example.com', // u_006
} as const;

/** "Now" used by the §11 dashboard/occupancy acceptance tests: 2026-11-23 19:30 IST. */
export const SEED_NOW = new Date('2026-11-23T14:00:00.000Z');

/** Seeds the in-memory DB; `id('d_001')` maps a mock id to its new ObjectId hex. */
export async function seed(options?: Parameters<typeof seedDatabase>[0]) {
  const result: SeedResult = await seedDatabase(options);
  const id = (mockId: string): string => {
    const hex = result.ids[mockId];
    if (!hex) throw new Error(`No seed id for ${mockId}`);
    return hex;
  };
  return { ...result, id };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string; email: string };
}

export async function login(email: string, password = PASSWORD): Promise<Session> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data as Session;
}

/** Access token for a seeded user without going through bcrypt (fast). */
export async function tokenFor(email: string): Promise<string> {
  const user = await UserModel.findOne({ email }).lean();
  if (!user) throw new Error(`No user ${email}`);
  return signAccessToken(user._id.toHexString(), user.role, user.tokenVersion);
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Requests to /api/v1 as the holder of `token` (no token = anonymous). */
export function as(token?: string) {
  const withAuth = (req: request.Test) => (token ? req.set(bearer(token)) : req);
  return {
    get: (path: string) => withAuth(request(app).get(`/api/v1${path}`)),
    post: (path: string, body: object = {}) => withAuth(request(app).post(`/api/v1${path}`)).send(body),
    patch: (path: string, body: object = {}) => withAuth(request(app).patch(`/api/v1${path}`)).send(body),
    delete: (path: string) => withAuth(request(app).delete(`/api/v1${path}`)),
  };
}

/** API clients for admin (Kush), staff (Neha), user (Priya) and anonymous. */
export async function clients() {
  const [admin, staff, user] = await Promise.all([tokenFor(EMAILS.admin), tokenFor(EMAILS.staff), tokenFor(EMAILS.user)]);
  return { admin: as(admin), staff: as(staff), user: as(user), anonymous: as() };
}
export type Clients = Awaited<ReturnType<typeof clients>>;

/** Seed + clients + clock pinned to SEED_NOW (most suites want all three). */
export async function seededWorld() {
  const seeded = await seed();
  setNow(SEED_NOW);
  return { ...seeded, c: await clients() };
}

export const ids = (res: request.Response) => (res.body.data as Array<{ id: string }>).map((item) => item.id);

/** Asserts the error envelope: status, code, non-empty message (and details when given). */
export function expectError(
  res: request.Response,
  status: number,
  code: string,
  message?: string,
  details?: Record<string, unknown>,
) {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(res.body.error?.code).toBe(code);
  expect(typeof res.body.error?.message).toBe('string');
  expect(res.body.error.message.length).toBeGreaterThan(0);
  if (message !== undefined) expect(res.body.error.message).toBe(message);
  if (details !== undefined) expect(res.body.error.details).toEqual(details);
}
