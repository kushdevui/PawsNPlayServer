import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_HASH, CURRENT_VERSION, CURRENT_WAIVER, hashWaiver } from '../src/modules/waivers/content/index.js';
import { QuestionnaireModel } from '../src/modules/questionnaires/questionnaires.model.js';
import { WaiverModel } from '../src/modules/waivers/waivers.model.js';
import { app, EMAILS, expectError, ids, seededWorld, tokenFor, type Clients } from './helpers.js';

let c: Clients;
let id: (mockId: string) => string;

beforeEach(async () => {
  ({ c, id } = await seededWorld());
});

const REQUIRED_KEYS = CURRENT_WAIVER.consents.filter((k) => k.required).map((k) => k.key);
const allConsents = (): Record<string, boolean> => Object.fromEntries(REQUIRED_KEYS.map((k) => [k, true]));

const signature = () => ({
  width: 320,
  height: 120,
  strokes: [
    [[10, 60], [30, 40], [50, 70], [70, 30], [90, 80]],
    [[120, 50], [140, 52], [160, 55], [180, 60], [200, 66], [220, 70]],
  ],
});

const validBody = (overrides: Record<string, unknown> = {}) => ({
  version: CURRENT_VERSION,
  contentHash: CURRENT_HASH,
  parentName: 'Asha  Rao',
  dogName: 'Kaju',
  phone: '+91 98765 43210',
  consents: { ...allConsents(), photosOptOut: true },
  typedSignature: 'asha rao',
  signature: signature(),
  website: '',
  ...overrides,
});

const sign = (body: unknown) => request(app).post('/api/v1/waivers').set('User-Agent', 'vitest-browser').send(body as object);

const create = async (overrides: Record<string, unknown> = {}) => {
  const res = await sign(validBody(overrides));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
};

describe('GET /waivers/current (public)', () => {
  it('returns version, contentHash, content and consents with an ETag', async () => {
    const res = await request(app).get('/api/v1/waivers/current');
    expect(res.status).toBe(200);
    expect(res.headers.etag).toBe(`"${CURRENT_HASH}"`);
    expect(res.headers['cache-control']).toContain('max-age=300');
    expect(res.body.data.version).toBe('2026-11');
    expect(res.body.data.contentHash).toBe(hashWaiver(CURRENT_WAIVER));
    expect(res.body.data.content.parts.map((p: { id: string }) => p.id)).toEqual([
      'how-we-work',
      'before-the-stay',
      'what-to-expect',
      'what-you-confirm',
      'risks-you-accept',
      'if-your-dog-needs-a-vet',
      'other-things-you-agree-to',
      'commitment-and-signature',
    ]);
    expect(res.body.data.consents.map((k: { key: string }) => k.key)).toEqual([
      'confirm1', 'confirm2', 'confirm3', 'confirm4', 'confirm5', 'confirm6', 'confirm7',
      'acceptRisks', 'vetAuthorisation', 'acceptOtherTerms', 'finalAgreement', 'photosOptOut',
    ]);
    expect(res.body.data.consents.at(-1)).toMatchObject({ key: 'photosOptOut', required: false });
    expect(JSON.stringify(res.body.data.content)).toContain('Five Tails Collective LLP');
  });

  it('answers 304 when the ETag matches', async () => {
    const res = await request(app).get('/api/v1/waivers/current').set('If-None-Match', `"${CURRENT_HASH}"`);
    expect(res.status).toBe(304);
  });
});

describe('POST /waivers (public)', () => {
  it('stores the signed waiver with a snapshot and returns 201 { id, signedAt, version }', async () => {
    const res = await sign(validBody());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      data: { id: expect.stringMatching(/^[0-9a-f]{24}$/), signedAt: expect.any(String), version: '2026-11' },
    });

    const stored = await WaiverModel.findById(res.body.data.id).lean();
    expect(stored).toMatchObject({
      status: 'signed',
      version: CURRENT_VERSION,
      contentHash: CURRENT_HASH,
      parentName: 'Asha Rao',
      dogName: 'Kaju',
      typedSignature: 'asha rao',
      userAgent: 'vitest-browser',
      dogId: null,
      questionnaireId: null,
    });
    expect(stored?.consents).toMatchObject({ confirm1: true, finalAgreement: true, photosOptOut: true });
    expect(stored?.snapshot).toEqual(JSON.parse(JSON.stringify(CURRENT_WAIVER)));
    expect(stored?.signatureSvg).toMatch(/^<svg [^>]*viewBox="0 0 320 120"/);
    expect(stored?.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('links an existing questionnaire; rejects an unknown one', async () => {
    const questionnaire = await QuestionnaireModel.create({ answers: { dogName: 'Kaju', ownerName: 'Asha Rao' } });
    const wid = await create({ questionnaireId: questionnaire._id.toHexString() });
    expect((await WaiverModel.findById(wid).lean())?.questionnaireId?.toHexString()).toBe(questionnaire._id.toHexString());
    expectError(
      await sign(validBody({ questionnaireId: '0123456789abcdef01234567' })),
      422,
      'VALIDATION_ERROR',
      'We couldn’t find that Know Your Dog form.',
    );
  });

  it('honeypot -> fake 201, nothing stored', async () => {
    const res = await sign(validBody({ website: 'http://spam.example' }));
    expect(res.status).toBe(201);
    expect(res.body.data.id).toMatch(/^[0-9a-f]{24}$/);
    expect(await WaiverModel.countDocuments()).toBe(0);
  });

  it('outdated version or hash -> 409 WAIVER_OUTDATED', async () => {
    const message = 'The waiver was updated. Please reload the page and sign again.';
    expectError(await sign(validBody({ version: '2025-01' })), 409, 'WAIVER_OUTDATED', message);
    expectError(await sign(validBody({ contentHash: 'abc' })), 409, 'WAIVER_OUTDATED', message);
  });

  it.each(REQUIRED_KEYS)('missing consent %s -> 422 "Please tick: ..."', async (key) => {
    const consents = allConsents();
    delete consents[key];
    const shortLabel = CURRENT_WAIVER.consents.find((k) => k.key === key)?.shortLabel;
    expectError(await sign(validBody({ consents })), 422, 'VALIDATION_ERROR', `Please tick: ${shortLabel}`);
    expect(await WaiverModel.countDocuments()).toBe(0);
  });

  it('a consent must be literally true (not "yes")', async () => {
    expectError(await sign(validBody({ consents: { ...allConsents(), finalAgreement: 'yes' } })), 422, 'VALIDATION_ERROR');
  });

  it('names and phone are required', async () => {
    expectError(await sign(validBody({ parentName: ' ' })), 422, 'VALIDATION_ERROR', 'Please enter your name.');
    expectError(await sign(validBody({ dogName: '' })), 422, 'VALIDATION_ERROR', 'Please enter your dog’s name.');
    expectError(await sign(validBody({ phone: 'call me' })), 422, 'VALIDATION_ERROR', 'Please enter a valid phone number.');
  });

  it('typed signature must match the parent name (ignoring case and extra spaces)', async () => {
    const message = 'Please type your full name exactly as above to sign.';
    expectError(await sign(validBody({ typedSignature: 'Asha' })), 422, 'VALIDATION_ERROR', message);
    expectError(await sign(validBody({ typedSignature: '' })), 422, 'VALIDATION_ERROR', message);
    expect((await sign(validBody({ typedSignature: '  ASHA   RAO ' }))).status).toBe(201);
  });

  it.each([
    ['missing', undefined],
    ['no strokes', { width: 320, height: 120, strokes: [] }],
    ['too few points', { width: 320, height: 120, strokes: [[[10, 10], [12, 12]]] }],
    ['a point outside the box', { width: 320, height: 120, strokes: [[[10, 10], [20, 20], [30, 30], [40, 40], [50, 50], [60, 60], [70, 70], [80, 80], [90, 90], [500, 100]]] }],
    ['a tiny dot', { width: 320, height: 120, strokes: [Array.from({ length: 12 }, () => [50, 50])] }],
    ['box too small', { ...signature(), width: 50 }],
    ['non-numbers', { width: 320, height: 120, strokes: [[['a', 'b']]] }],
  ])('bad signature (%s) -> 422 "Please sign in the box."', async (_label, sig) => {
    expectError(await sign(validBody({ signature: sig })), 422, 'VALIDATION_ERROR', 'Please sign in the box.');
  });
});

describe('admin / staff', () => {
  it('lists newest first with list-item fields; search and date filters', async () => {
    const first = await create({ parentName: 'Asha Rao', typedSignature: 'Asha Rao', dogName: 'Kaju' });
    const second = await create({
      parentName: 'Vik Sen', typedSignature: 'vik sen', dogName: 'Bolt', phone: '90000 22222',
      consents: allConsents(),
    });

    const res = await c.staff.get('/waivers');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 50 });
    expect(ids(res)).toEqual([second, first]);
    expect(res.body.data[0]).toEqual({
      id: second,
      signedAt: expect.any(String),
      parentName: 'Vik Sen',
      dogName: 'Bolt',
      phone: '90000 22222',
      version: '2026-11',
      photosOptOut: false,
      questionnaireId: null,
      dogId: null,
    });
    expect(res.body.data[1].photosOptOut).toBe(true);

    expect(ids(await c.admin.get('/waivers?search=kaju'))).toEqual([first]);
    expect(ids(await c.admin.get('/waivers?search=22222'))).toEqual([second]);
    expect(ids(await c.admin.get('/waivers?search=(.*'))).toEqual([]);
    expect(ids(await c.admin.get('/waivers?from=2000-01-01T00:00:00.000Z&to=2000-01-02T00:00:00.000Z'))).toEqual([]);
  });

  it('GET /:id returns the full record (consents with labels) without ipHash', async () => {
    const wid = await create();
    const res = await c.staff.get(`/waivers/${wid}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      [
        'consents', 'content', 'contentHash', 'createdAt', 'dogId', 'dogName', 'id', 'parentName', 'phone',
        'photosOptOut', 'questionnaireId', 'signature', 'signatureSvg', 'signedAt', 'status', 'typedSignature',
        'updatedAt', 'userAgent', 'version',
      ].sort(),
    );
    expect(res.body.data.consents[0]).toEqual({
      key: 'confirm1',
      label: CURRENT_WAIVER.consents[0]?.label,
      required: true,
      value: true,
    });
    expect(res.body.data.signature.strokes).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain('ipHash');
    expectError(await c.admin.get('/waivers/0123456789abcdef01234567'), 404, 'NOT_FOUND', 'Waiver not found');
  });

  it('GET /:id/document is printable HTML (Bearer or ?token=)', async () => {
    const wid = await create();
    const viaHeader = await c.staff.get(`/waivers/${wid}/document`);
    expect(viaHeader.status).toBe(200);
    expect(viaHeader.headers['content-type']).toContain('text/html');
    expect(viaHeader.headers['cache-control']).toBe('no-store');
    expect(viaHeader.text).toContain('Paws N Play: Boarding Consent &amp; Waiver');
    expect(viaHeader.text).toContain('Five Tails Collective LLP');
    expect(viaHeader.text).toContain('<svg');
    expect(viaHeader.text).toContain(CURRENT_HASH);
    expect(viaHeader.text).toContain('Asha Rao');
    expect(viaHeader.text).not.toMatch(/<script|https?:\/\/(?!www\.w3\.org)/);

    const token = await tokenFor(EMAILS.admin);
    const viaQuery = await request(app).get(`/api/v1/waivers/${wid}/document?token=${token}`);
    expect(viaQuery.status).toBe(200);

    expectError(await request(app).get(`/api/v1/waivers/${wid}/document?token=bad`), 401, 'UNAUTHORIZED');
    const userToken = await tokenFor(EMAILS.user);
    expectError(await request(app).get(`/api/v1/waivers/${wid}/document?token=${userToken}`), 403, 'FORBIDDEN');
  });

  it('?token= is only accepted on the document route', async () => {
    const token = await tokenFor(EMAILS.admin);
    expectError(await request(app).get(`/api/v1/waivers?token=${token}`), 401, 'UNAUTHORIZED');
  });

  it('escapes user text in the document', async () => {
    const wid = await create({ dogName: '<script>alert(1)</script>' });
    const res = await c.admin.get(`/waivers/${wid}/document`);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('PATCH links a dog/questionnaire; everything else is immutable', async () => {
    const wid = await create();
    const linked = await c.admin.patch(`/waivers/${wid}`, { dogId: id('d_001') });
    expect(linked.status).toBe(200);
    expect(linked.body.data.dogId).toBe(id('d_001'));
    expect((await c.admin.patch(`/waivers/${wid}`, { dogId: null })).body.data.dogId).toBeNull();

    const message = 'A signed waiver can’t be changed. Only the linked dog and Know Your Dog form can be updated.';
    expectError(await c.admin.patch(`/waivers/${wid}`, { parentName: 'Someone Else' }), 422, 'VALIDATION_ERROR', message);
    expectError(await c.admin.patch(`/waivers/${wid}`, { consents: {} }), 422, 'VALIDATION_ERROR', message);
    expectError(
      await c.admin.patch(`/waivers/${wid}`, { dogId: '0123456789abcdef01234567' }),
      422,
      'VALIDATION_ERROR',
      'Choose an existing dog.',
    );
    expect((await WaiverModel.findById(wid).lean())?.parentName).toBe('Asha Rao');
    expectError(await c.admin.delete(`/waivers/${wid}`), 405, 'METHOD_NOT_ALLOWED');
  });

  it('staff read-only, user 403, anonymous 401', async () => {
    const wid = await create();
    expectError(await c.staff.patch(`/waivers/${wid}`, { dogId: null }), 403, 'FORBIDDEN');
    expectError(await c.user.get('/waivers'), 403, 'FORBIDDEN');
    expectError(await c.user.get(`/waivers/${wid}`), 403, 'FORBIDDEN');
    expectError(await c.anonymous.get('/waivers'), 401, 'UNAUTHORIZED');
    expectError(await c.anonymous.get(`/waivers/${wid}/document`), 401, 'UNAUTHORIZED');
  });
});
