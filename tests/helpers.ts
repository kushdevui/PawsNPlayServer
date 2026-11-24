import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';

export const app = createApp();

export const PASSWORD = 'password123';
export const EMAILS = {
  admin: 'admin@pawsnplay.com', // u_001
  user: 'priya@example.com', // u_002
  otherUser: 'rohan@example.com', // u_003
  staff: 'neha.staff@pawsnplay.com', // u_004
  inactive: 'ananya@example.com', // u_006
} as const;

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string };
}

export async function login(email: string, password = PASSWORD): Promise<Session> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data as Session;
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

/** Logs in the three main seed roles (+ the second user) and returns their API clients. */
export async function loginAll() {
  const [admin, user, otherUser, staff] = await Promise.all([
    login(EMAILS.admin),
    login(EMAILS.user),
    login(EMAILS.otherUser),
    login(EMAILS.staff),
  ]);
  return {
    admin: as(admin.accessToken),
    user: as(user.accessToken), // priya, u_002
    otherUser: as(otherUser.accessToken), // rohan, u_003
    staff: as(staff.accessToken), // neha, u_004
    anonymous: as(),
  };
}
export type Clients = Awaited<ReturnType<typeof loginAll>>;

export const ids = (res: request.Response) => (res.body.data as Array<{ id: string }>).map((item) => item.id);

/** Asserts the error envelope with a code and a non-empty message. */
export function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
  expect(res.body.error.message.length).toBeGreaterThan(0);
}
