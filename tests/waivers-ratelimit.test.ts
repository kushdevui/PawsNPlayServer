import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Runs before the imports below, so src/config/env.ts sees the low limits (tests/setup.ts sets 1000).
vi.hoisted(() => {
  process.env.WAIVER_RATE_PER_HOUR = '2';
  process.env.WAIVER_RATE_PER_DAY = '20';
});

const { app, expectError, seed } = await import('./helpers.js');

beforeAll(async () => {
  await seed();
});

describe('POST /waivers rate limit', () => {
  it('allows WAIVER_RATE_PER_HOUR submissions per IP, then 429 RATE_LIMITED', async () => {
    // Honeypot submissions are cheap and still count toward the limit.
    const post = () => request(app).post('/api/v1/waivers').send({ website: 'bot' });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expectError(await post(), 429, 'RATE_LIMITED');
  });

  it('GET /waivers/current is not rate-limited', async () => {
    for (let i = 0; i < 5; i += 1) expect((await request(app).get('/api/v1/waivers/current')).status).toBe(200);
  });
});
