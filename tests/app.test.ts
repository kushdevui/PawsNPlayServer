import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/v1/health', () => {
  it('returns ok and the db status', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', db: 'connected' } });
  });
});

describe('unknown routes', () => {
  it('returns 404 ROUTE_NOT_FOUND in the error envelope', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String) },
    });
  });

  it('also covers paths outside /api/v1', async () => {
    const res = await request(app).post('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('malformed JSON body', () => {
  it('returns 422 VALIDATION_ERROR instead of a stack trace', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: expect.any(String) } });
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows configured CORS origins only', async () => {
    const allowed = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:8081');
    const blocked = await request(app).get('/api/v1/health').set('Origin', 'http://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
