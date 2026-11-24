import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, expectError } from './helpers.js';

describe('GET /api/v1/health', () => {
  it('returns ok, the server time and the db status (public)', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', time: expect.any(String), db: 'connected' } });
    expect(new Date(res.body.data.time).toISOString()).toBe(res.body.data.time);
  });
});

describe('unknown routes and methods', () => {
  it('returns 404 ROUTE_NOT_FOUND for an unknown path', async () => {
    expectError(await request(app).get('/api/v1/does-not-exist'), 404, 'ROUTE_NOT_FOUND');
    expectError(await request(app).post('/nope'), 404, 'ROUTE_NOT_FOUND');
  });

  it('returns 405 METHOD_NOT_ALLOWED for a known path with the wrong method', async () => {
    expectError(await request(app).delete('/api/v1/health'), 405, 'METHOD_NOT_ALLOWED');
    expectError(await request(app).get('/api/v1/auth/login'), 405, 'METHOD_NOT_ALLOWED');
  });
});

describe('malformed JSON body', () => {
  it('returns 422 VALIDATION_ERROR instead of a stack trace', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expectError(res, 422, 'VALIDATION_ERROR');
  });
});

describe('security headers', () => {
  it('sets helmet headers, hides x-powered-by and returns a request id', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('allows configured CORS origins only (tests use a list, not "*")', async () => {
    const allowed = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:8081');
    const blocked = await request(app).get('/api/v1/health').set('Origin', 'http://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
