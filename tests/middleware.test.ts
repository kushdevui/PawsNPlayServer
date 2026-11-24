import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../src/middleware/error.js';
import { notFound } from '../src/middleware/notFound.js';
import { validate } from '../src/middleware/validate.js';
import { AppError } from '../src/utils/AppError.js';
import { parsePagination } from '../src/utils/pagination.js';
import { list } from '../src/utils/respond.js';

/** A tiny app that exercises the shared middleware with throw-away routes. */
function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get('/app-error', () => {
    throw AppError.notFound('Booking');
  });
  app.get('/rule-error', () => {
    throw AppError.rule('CAPACITY_FULL', 'Boarding is full (15 dogs) for part of these dates.', { peak: 15, capacity: 15 });
  });
  app.get('/async-crash', async () => {
    await Promise.resolve();
    throw new Error('database exploded: secret details');
  });
  app.post(
    '/validated/:id',
    validate({
      params: z.object({ id: z.string().regex(/^b_/, 'Booking id is invalid.') }),
      query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      body: z.object({ name: z.string({ required_error: 'Name is required.' }).min(1, 'Name is required.') }),
    }),
    (req, res) => {
      res.json({ data: { params: req.params, query: req.query, body: req.body } });
    },
  );
  app.get('/list', (req, res) => {
    const { page, limit } = parsePagination(req.query);
    list(res, [{ id: 'x_1' }], { total: 1, page, limit });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const app = buildTestApp();

describe('error handler', () => {
  it('turns AppError into the error envelope', async () => {
    const res = await request(app).get('/app-error');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Booking not found' } });
  });

  it('includes optional details', async () => {
    const res = await request(app).get('/rule-error');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: {
        code: 'CAPACITY_FULL',
        message: 'Boarding is full (15 dogs) for part of these dates.',
        details: { peak: 15, capacity: 15 },
      },
    });
  });

  it('turns unexpected (async) errors into 500 INTERNAL_ERROR without leaking details', async () => {
    const res = await request(app).get('/async-crash');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});

describe('validate middleware', () => {
  it('passes parsed params, query and body to the handler', async () => {
    const res = await request(app).post('/validated/b_001?page=3').send({ name: 'Bruno' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ params: { id: 'b_001' }, query: { page: 3 }, body: { name: 'Bruno' } });
  });

  it('returns 422 VALIDATION_ERROR with the schema message for a bad body', async () => {
    const res = await request(app).post('/validated/b_001').send({});

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Name is required.' } });
  });

  it('treats a missing body as empty', async () => {
    const res = await request(app).post('/validated/b_001');

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Name is required.');
  });

  it('validates params', async () => {
    const res = await request(app).post('/validated/x_1').send({ name: 'Bruno' });

    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Booking id is invalid.' });
  });
});

describe('pagination + list envelope', () => {
  it('defaults to page 1, limit 50', async () => {
    const res = await request(app).get('/list');

    expect(res.body).toEqual({ data: [{ id: 'x_1' }], meta: { total: 1, page: 1, limit: 50 } });
  });

  it('clamps like the app mocks (invalid -> defaults, limit 1..500)', () => {
    expect(parsePagination({ page: 'abc', limit: '0' })).toEqual({ page: 1, limit: 50, skip: 0 });
    expect(parsePagination({ page: '3', limit: '500' })).toEqual({ page: 3, limit: 500, skip: 1000 });
    expect(parsePagination({ page: '1', limit: '9999' })).toEqual({ page: 1, limit: 500, skip: 0 });
    expect(parsePagination({ page: '-2', limit: '-5' })).toEqual({ page: 1, limit: 1, skip: 0 });
  });
});
