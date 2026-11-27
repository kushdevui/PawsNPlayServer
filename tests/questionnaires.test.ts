import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { QuestionnaireModel } from '../src/modules/questionnaires/questionnaires.model.js';
import { app, expectError, ids, seededWorld, type Clients } from './helpers.js';

let c: Clients;
let id: (mockId: string) => string;

beforeEach(async () => {
  ({ c, id } = await seededWorld());
});

/** What the app's /know-your-dog form sends (required fields + a few optional ones). */
const validAnswers = (overrides: Record<string, unknown> = {}) => ({
  ownerName: 'Asha Rao',
  ownerPhone: '+91 98765 43210',
  emergencyName: 'Ravi Rao',
  emergencyPhone: '98765-00000',
  dogName: 'Kaju',
  breed: 'Indie',
  age: '3 years',
  sex: 'female',
  sterilised: 'no',
  heatInfo: 'Last heat in August',
  rabiesDate: '2026-03-10',
  otherDogs: 'Barks at big dogs at first, fine after a sniff',
  withPeople: 'Wary of men',
  standardMealOk: 'yes',
  keepSeparate: 'no',
  bath: 'yes',
  sendingItems: 'Her bowl and blanket',
  confirmTrue: true,
  signName: 'Asha Rao',
  signDate: '2026-11-26',
  ...overrides,
});

const PDF = Buffer.from('%PDF-1.4\n% vaccination card\n');

const submit = (
  answers: unknown,
  { website = '', files = [] as Array<{ buffer: Buffer; filename: string; contentType: string }> } = {},
) => {
  let req = request(app)
    .post('/api/v1/questionnaires')
    .field('answers', typeof answers === 'string' ? answers : JSON.stringify(answers))
    .field('website', website);
  for (const f of files) req = req.attach('documents', f.buffer, { filename: f.filename, contentType: f.contentType });
  return req;
};

/** Stores a submission straight through the API and returns its id. */
const create = async (overrides: Record<string, unknown> = {}) => {
  const res = await submit(validAnswers(overrides));
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};

describe('POST /questionnaires (public)', () => {
  it('stores the answers and a file -> 201 { id, createdAt }', async () => {
    // Keys from the earlier form (ratings grid, breedsDislike) are no longer accepted and are dropped like any unknown key.
    const res = await submit(validAnswers({ unknownKey: 'dropped', with_biggerDogs: 'unsure', breedsDislike: 'Pugs' }), {
      files: [{ buffer: PDF, filename: 'vaccines.pdf', contentType: 'application/pdf' }],
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: expect.stringMatching(/^[0-9a-f]{24}$/), createdAt: expect.any(String) } });

    const stored = await QuestionnaireModel.findById(res.body.data.id).lean();
    expect(stored?.status).toBe('new');
    expect(stored?.answers).toMatchObject({
      dogName: 'Kaju',
      otherDogs: 'Barks at big dogs at first, fine after a sniff',
      keepSeparate: 'no',
      sendingItems: 'Her bowl and blanket',
      confirmTrue: true,
    });
    expect(stored?.answers).not.toHaveProperty('unknownKey');
    expect(stored?.answers).not.toHaveProperty('with_biggerDogs');
    expect(stored?.answers).not.toHaveProperty('breedsDislike');
    expect(stored?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toMatch(/127\.0\.0\.1|::1/); // no raw IP
    expect(stored?.documents).toHaveLength(1);
    expect(stored?.documents[0]).toMatchObject({ name: 'vaccines.pdf', mimeType: 'application/pdf', size: PDF.length });
    expect(stored?.documents[0]?.uri).toMatch(/\/uploads\/questionnaires\/\d{4}\/\d{2}\/[0-9a-f-]{36}-vaccines\.pdf$/);
  });

  it('works without files (and trims / drops empty answers)', async () => {
    const qid = await create({ dogName: '  Kaju  ', weight: '   ' });
    const stored = await QuestionnaireModel.findById(qid).lean();
    expect(stored?.answers.dogName).toBe('Kaju');
    expect(stored?.answers).not.toHaveProperty('weight');
    expect(stored?.documents).toEqual([]);
  });

  it('honeypot filled -> 201 with a fake id, nothing stored', async () => {
    const res = await submit(validAnswers(), { website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toMatch(/^[0-9a-f]{24}$/);
    expect(await QuestionnaireModel.countDocuments()).toBe(0);
  });

  it.each([
    ['ownerName', 'Please enter your name.'],
    ['emergencyPhone', 'Please enter a valid emergency contact phone number.'],
    ['dogName', "Please enter your dog's name."],
    ['sex', "Please choose your dog's sex."],
    ['sterilised', 'Please tell us if your dog is sterilised.'],
    ['signName', 'Please type your name to sign.'],
  ])('missing %s -> 422 with a friendly message', async (field, message) => {
    const answers: Record<string, unknown> = validAnswers();
    delete answers[field];
    expectError(await submit(answers), 422, 'VALIDATION_ERROR', message);
    expect(await QuestionnaireModel.countDocuments()).toBe(0);
  });

  it('confirmTrue must be true; phones must look like phones; answers must be JSON', async () => {
    expectError(
      await submit(validAnswers({ confirmTrue: false })),
      422,
      'VALIDATION_ERROR',
      'Please confirm that your answers are true.',
    );
    expectError(
      await submit(validAnswers({ ownerPhone: 'call me' })),
      422,
      'VALIDATION_ERROR',
      'Please enter a valid phone number for you.',
    );
    expectError(await submit('{not json'), 422, 'VALIDATION_ERROR');
    expectError(await submit(validAnswers({ anythingElse: 'x'.repeat(2001) })), 422, 'VALIDATION_ERROR');
  });

  it('wrong file type (zip, svg) -> 422 and nothing stored', async () => {
    for (const [filename, contentType] of [
      ['notes.zip', 'application/zip'],
      ['logo.svg', 'image/svg+xml'],
    ] as const) {
      expectError(
        await submit(validAnswers(), { files: [{ buffer: Buffer.from('x'), filename, contentType }] }),
        422,
        'VALIDATION_ERROR',
        `${filename} is not a photo or PDF.`,
      );
    }
    expect(await QuestionnaireModel.countDocuments()).toBe(0);
  });

  it('more than 5 files -> 422', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({ buffer: PDF, filename: `f${i}.pdf`, contentType: 'application/pdf' }));
    expectError(await submit(validAnswers(), { files }), 422, 'VALIDATION_ERROR', 'You can add up to 5 files.');
  });
});

describe('GET /questionnaires (admin, staff)', () => {
  it('lists newest first with the list-item fields; filters by status and search', async () => {
    const first = await create({ dogName: 'Kaju', ownerName: 'Asha Rao', ownerPhone: '90000 11111' });
    const second = await create({ dogName: 'Bolt', ownerName: 'Vik Sen', ownerPhone: '90000 22222', breed: 'Beagle' });

    const res = await c.staff.get('/questionnaires');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 50 });
    expect(ids(res)).toEqual([second, first]);
    expect(res.body.data[0]).toEqual({
      id: second,
      status: 'new',
      createdAt: expect.any(String),
      dogName: 'Bolt',
      breed: 'Beagle',
      ownerName: 'Vik Sen',
      ownerPhone: '90000 22222',
      documentsCount: 0,
    });

    expect(ids(await c.admin.get('/questionnaires?search=kaju'))).toEqual([first]);
    expect(ids(await c.admin.get('/questionnaires?search=vik'))).toEqual([second]);
    expect(ids(await c.admin.get('/questionnaires?search=22222'))).toEqual([second]);
    expect(ids(await c.admin.get('/questionnaires?search=(.*'))).toEqual([]);

    await c.admin.patch(`/questionnaires/${first}`, { status: 'reviewed' }).expect(200);
    expect(ids(await c.admin.get('/questionnaires?status=reviewed'))).toEqual([first]);
    expect(ids(await c.admin.get('/questionnaires?status=new'))).toEqual([second]);
  });

  it('GET /:id returns the full questionnaire without internal fields', async () => {
    const qid = await create();
    const res = await c.staff.get(`/questionnaires/${qid}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['answers', 'createdAt', 'documents', 'dogId', 'id', 'reviewedAt', 'reviewedBy', 'reviewedByName', 'status', 'updatedAt'].sort(),
    );
    expect(res.body.data).toMatchObject({ id: qid, status: 'new', dogId: null, reviewedBy: null, reviewedByName: null, reviewedAt: null });
    expect(res.body.data.answers).toMatchObject({ dogName: 'Kaju', ownerPhone: '+91 98765 43210' });
    expectError(await c.admin.get('/questionnaires/0123456789abcdef01234567'), 404, 'NOT_FOUND', 'Questionnaire not found');
  });

  it('user role and anonymous cannot read', async () => {
    expectError(await c.user.get('/questionnaires'), 403, 'FORBIDDEN');
    expectError(await c.anonymous.get('/questionnaires'), 401, 'UNAUTHORIZED');
  });
});

describe('PATCH /questionnaires/:id (admin)', () => {
  it('sets status (records reviewer) and links a dog', async () => {
    const qid = await create();
    const res = await c.admin.patch(`/questionnaires/${qid}`, { status: 'reviewed', dogId: id('d_001') });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'reviewed',
      dogId: id('d_001'),
      reviewedBy: id('u_001'),
      reviewedByName: 'Kush',
      reviewedAt: expect.any(String),
    });
    // The single GET returns the reviewer's name too, so the detail screen needs no second call.
    expect((await c.admin.get(`/questionnaires/${qid}`)).body.data.reviewedByName).toBe('Kush');

    const reset = await c.admin.patch(`/questionnaires/${qid}`, { status: 'new', dogId: null });
    expect(reset.body.data).toMatchObject({ status: 'new', dogId: null, reviewedBy: null, reviewedByName: null, reviewedAt: null });
  });

  it('dogId must exist; status must be valid', async () => {
    const qid = await create();
    expectError(
      await c.admin.patch(`/questionnaires/${qid}`, { dogId: '0123456789abcdef01234567' }),
      422,
      'VALIDATION_ERROR',
      'Choose an existing dog.',
    );
    expectError(await c.admin.patch(`/questionnaires/${qid}`, { status: 'done' }), 422, 'VALIDATION_ERROR', 'Invalid status.');
  });

  it('staff is read-only (403); user 403', async () => {
    const qid = await create();
    expectError(await c.staff.patch(`/questionnaires/${qid}`, { status: 'reviewed' }), 403, 'FORBIDDEN');
    expectError(await c.user.patch(`/questionnaires/${qid}`, { status: 'reviewed' }), 403, 'FORBIDDEN');
  });
});
