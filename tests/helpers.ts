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

/** Asserts the error envelope with a code and a non-empty message. */
export function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
  expect(res.body.error.message.length).toBeGreaterThan(0);
}
