import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Runs before the imports below, so src/config/env.ts sees the low limits (tests/setup.ts sets 1000).
vi.hoisted(() => {
  process.env.QUESTIONNAIRE_RATE_PER_HOUR = '2';
  process.env.QUESTIONNAIRE_RATE_PER_DAY = '20';
});

const { app, expectError, seed } = await import('./helpers.js');

beforeAll(async () => {
  await seed();
});

describe('POST /questionnaires rate limit', () => {
  it('allows QUESTIONNAIRE_RATE_PER_HOUR submissions per IP, then 429 RATE_LIMITED', async () => {
    // Honeypot submissions are cheap and still count toward the limit.
    const post = () => request(app).post('/api/v1/questionnaires').field('answers', '{}').field('website', 'bot');
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expectError(await post(), 429, 'RATE_LIMITED');
  });
});
