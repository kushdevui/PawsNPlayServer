import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { safeFileName, storageKey } from '../src/modules/uploads/storage.js';
import { app, bearer, EMAILS, expectError, seed, tokenFor } from './helpers.js';

let adminToken: string;

beforeEach(async () => {
  await seed();
  adminToken = await tokenFor(EMAILS.admin);
});

const PDF = Buffer.from('%PDF-1.4\n% test file\n');

const upload = (token: string, file?: { buffer: Buffer; filename: string; contentType: string }) => {
  const req = request(app).post('/api/v1/uploads').set(bearer(token));
  return file ? req.attach('file', file.buffer, { filename: file.filename, contentType: file.contentType }) : req;
};

describe('POST /uploads (local provider)', () => {
  it('stores a PDF and returns 201 { url, name, mimeType, size } with an absolute URL that serves the file', async () => {
    const res = await upload(adminToken, { buffer: PDF, filename: 'card.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      url: expect.stringMatching(/^http:\/\/[^/]+\/uploads\/dogs\/\d{4}\/\d{2}\/[0-9a-f-]{36}-card\.pdf$/),
      name: 'card.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
    });

    const file = await request(app).get(new URL(res.body.data.url).pathname);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(Number(file.headers['content-length'])).toBe(PDF.length);
  });

  it('accepts images', async () => {
    const res = await upload(adminToken, { buffer: Buffer.from([0xff, 0xd8, 0xff]), filename: 'dog.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
  });

  it('rejects other types (zip, svg) with "Documents must be images or PDFs."', async () => {
    for (const [filename, contentType] of [
      ['x.zip', 'application/zip'],
      ['x.svg', 'image/svg+xml'],
    ]) {
      expectError(
        await upload(adminToken, { buffer: Buffer.from('x'), filename: filename as string, contentType: contentType as string }),
        422,
        'VALIDATION_ERROR',
        'Documents must be images or PDFs.',
      );
    }
  });

  it('rejects files over 10 MB with "<name> is larger than 10 MB."', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    expectError(
      await upload(adminToken, { buffer: big, filename: 'big.pdf', contentType: 'application/pdf' }),
      422,
      'VALIDATION_ERROR',
      'big.pdf is larger than 10 MB.',
    );
  });

  it('requires a file, admin role and a token', async () => {
    expectError(await upload(adminToken), 422, 'VALIDATION_ERROR', 'Choose a file to upload.');
    const staffToken = await tokenFor(EMAILS.staff);
    expectError(await upload(staffToken, { buffer: PDF, filename: 'a.pdf', contentType: 'application/pdf' }), 403, 'FORBIDDEN');
    expectError(await request(app).post('/api/v1/uploads'), 401, 'UNAUTHORIZED');
  });
});

describe('storage helpers', () => {
  it('builds dogs/<yyyy>/<mm>/<uuid>-<safeName> keys with safe names', () => {
    expect(storageKey('Vaccination card (1).pdf', new Date('2026-11-23T10:00:00Z'))).toMatch(
      /^dogs\/2026\/11\/[0-9a-f-]{36}-Vaccination-card-1-\.pdf$/,
    );
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('...')).toBe('file');
  });
});
