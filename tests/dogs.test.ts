import { beforeEach, describe, expect, it } from 'vitest';
import { DogModel } from '../src/modules/dogs/dogs.model.js';
import { expectError, ids, seededWorld, type Clients } from './helpers.js';

let c: Clients;
let id: (mockId: string) => string;

beforeEach(async () => {
  ({ c, id } = await seededWorld());
});

const validDog = { name: 'Kaju', ownerName: 'Asha Rao', ownerPhone: '+91 90000 11111' };
const pdf = { kind: 'vaccination', name: 'card.pdf', uri: 'https://cdn.example.com/card.pdf', mimeType: 'application/pdf', size: 240000 };

describe('GET /dogs', () => {
  it('admin and staff can list; sorted by name; default excludes archived', async () => {
    await DogModel.updateOne({ _id: id('d_012') }, { status: 'archived' }); // Sheru
    const res = await c.staff.get('/dogs');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 11, page: 1, limit: 50 });
    const names = (res.body.data as Array<{ name: string }>).map((d) => d.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).not.toContain('Sheru');

    expect(ids(await c.admin.get('/dogs?status=archived'))).toEqual([id('d_012')]);
    expect((await c.admin.get('/dogs?status=all')).body.meta.total).toBe(12);
  });

  it('?search=lab returns only the Labrador (name/breed/owner, case-insensitive)', async () => {
    const res = await c.admin.get('/dogs?search=lab');
    expect(ids(res)).toEqual([id('d_001')]);
    expect(res.body.data[0].breed).toBe('Labrador Retriever');
    expect(ids(await c.admin.get('/dogs?search=98200 77777'))).toEqual([id('d_010')]); // owner phone
    expect(ids(await c.admin.get('/dogs?search=(.*'))).toEqual([]); // regex escaped
  });

  it('returns the exact Dog shape', async () => {
    const res = await c.admin.get(`/dogs/${id('d_001')}`);
    expect(res.body.data).toEqual({
      id: id('d_001'),
      name: 'Bruno',
      breed: 'Labrador Retriever',
      gender: 'male',
      dateOfBirth: '2022-05-14',
      weightKg: 28.5,
      color: 'Golden',
      ownerId: null,
      ownerName: 'Priya Sharma',
      ownerPhone: '+91 98100 00002',
      vaccinated: true,
      vaccinationExpiry: '2027-03-10',
      neutered: true,
      temperament: 'friendly',
      feedingNotes: '2 cups kibble, twice a day. No chicken.',
      medicalNotes: 'Allergic to chicken.',
      notes: '',
      photoUrl: null,
      documents: [],
      status: 'active',
      createdAt: '2026-09-01T04:30:00.000Z',
      updatedAt: '2026-09-01T04:30:00.000Z',
    });
  });

  it('404 "Dog not found"; user role 403', async () => {
    expectError(await c.admin.get('/dogs/0123456789abcdef01234567'), 404, 'NOT_FOUND', 'Dog not found');
    expectError(await c.user.get(`/dogs/${id('d_001')}`), 403, 'FORBIDDEN');
  });
});

describe('POST /dogs', () => {
  it('without ownerName -> 422 "Owner name is required."', async () => {
    expectError(
      await c.admin.post('/dogs', { name: 'Kaju', ownerPhone: '1' }),
      422,
      'VALIDATION_ERROR',
      'Owner name is required.',
    );
  });

  it('checks name first, then owner phone, gender, temperament, status', async () => {
    expectError(await c.admin.post('/dogs', { ownerName: 'A', ownerPhone: '1' }), 422, 'VALIDATION_ERROR', 'Dog name is required.');
    expectError(await c.admin.post('/dogs', { name: 'K', ownerName: 'A' }), 422, 'VALIDATION_ERROR', 'Owner phone is required.');
    expectError(await c.admin.post('/dogs', { ...validDog, gender: 'x' }), 422, 'VALIDATION_ERROR', 'Invalid gender.');
    expectError(await c.admin.post('/dogs', { ...validDog, temperament: 'x' }), 422, 'VALIDATION_ERROR', 'Invalid temperament.');
    expectError(await c.admin.post('/dogs', { ...validDog, status: 'x' }), 422, 'VALIDATION_ERROR', 'Invalid status.');
  });

  it('valid -> 201 with defaults (documents [], status active)', async () => {
    const res = await c.admin.post('/dogs', { ...validDog, id: 'hack', createdAt: '2000-01-01' });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      name: 'Kaju',
      breed: '',
      gender: 'male',
      dateOfBirth: null,
      weightKg: null,
      color: '',
      ownerId: null,
      ownerName: 'Asha Rao',
      ownerPhone: '+91 90000 11111',
      vaccinated: false,
      vaccinationExpiry: null,
      neutered: false,
      temperament: 'friendly',
      feedingNotes: '',
      medicalNotes: '',
      notes: '',
      photoUrl: null,
      documents: [],
      status: 'active',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('accepts image/PDF documents and exposes their id', async () => {
    const res = await c.admin.post('/dogs', { ...validDog, documents: [{ ...pdf, id: 'doc_1' }] });
    expect(res.status).toBe(201);
    expect(res.body.data.documents).toEqual([{ ...pdf, id: 'doc_1', uploadedAt: expect.any(String) }]);
  });

  it('documents with application/zip -> 422; with 20 MB -> 422', async () => {
    expectError(
      await c.admin.post('/dogs', { ...validDog, documents: [{ ...pdf, name: 'x.zip', mimeType: 'application/zip' }] }),
      422,
      'VALIDATION_ERROR',
      'Documents must be images or PDFs.',
    );
    expectError(
      await c.admin.post('/dogs', { ...validDog, documents: [{ ...pdf, size: 20 * 1024 * 1024 }] }),
      422,
      'VALIDATION_ERROR',
      'card.pdf is larger than 10 MB.',
    );
    expectError(
      await c.admin.post('/dogs', { ...validDog, documents: Array.from({ length: 11 }, () => pdf) }),
      422,
      'VALIDATION_ERROR',
      'Up to 10 documents per dog.',
    );
  });

  it('staff cannot create dogs', async () => {
    expectError(await c.staff.post('/dogs', validDog), 403, 'FORBIDDEN');
  });
});

describe('PATCH /dogs/:id', () => {
  it('partial update; required checks only for fields sent; documents replaces the list', async () => {
    const withDoc = await c.admin.patch(`/dogs/${id('d_003')}`, { notes: 'Calm', documents: [pdf] });
    expect(withDoc.status).toBe(200);
    expect(withDoc.body.data).toMatchObject({ name: 'Coco', notes: 'Calm' });
    expect(withDoc.body.data.documents).toHaveLength(1);

    const cleared = await c.admin.patch(`/dogs/${id('d_003')}`, { documents: [] });
    expect(cleared.body.data.documents).toEqual([]);
    expectError(await c.admin.patch(`/dogs/${id('d_003')}`, { ownerName: ' ' }), 422, 'VALIDATION_ERROR', 'Owner name is required.');
  });

  it('archiving a dog with a confirmed booking -> 422 HAS_OPEN_BOOKINGS', async () => {
    // Bella (d_009) has b_012 confirmed.
    expectError(
      await c.admin.patch(`/dogs/${id('d_009')}`, { status: 'archived' }),
      422,
      'HAS_OPEN_BOOKINGS',
      'Bella has upcoming or active bookings. Cancel or finish them first.',
    );
  });

  it('archiving a dog without open stays works and keeps it in history', async () => {
    // Oscar (d_010): only b_008, checked in -> check out first.
    await c.admin.patch(`/bookings/${id('b_008')}/status`, { status: 'checked_out' }).expect(200);
    const res = await c.admin.patch(`/dogs/${id('d_010')}`, { status: 'archived' });
    expect(res.body.data.status).toBe('archived');
    expect((await c.admin.get(`/bookings?dogId=${id('d_010')}`)).body.meta.total).toBe(1);
  });

  it('no DELETE (405); staff cannot edit (403)', async () => {
    expectError(await c.admin.delete(`/dogs/${id('d_001')}`), 405, 'METHOD_NOT_ALLOWED');
    expectError(await c.staff.patch(`/dogs/${id('d_001')}`, { notes: 'x' }), 403, 'FORBIDDEN');
  });
});
