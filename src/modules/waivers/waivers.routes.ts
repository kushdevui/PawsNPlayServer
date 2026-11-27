import { Router, type RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { requireAuth, requireAuthOrQueryToken, requireRole } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { parsePagination } from '../../utils/pagination.js';
import { created, list, ok } from '../../utils/respond.js';
import { idParams } from '../../utils/schemas.js';
import { loadSettings } from '../settings/settings.service.js';
import { CURRENT_HASH } from './content/index.js';
import { renderWaiverDocument } from './waivers.document.js';
import { listWaiversQuery, updateWaiverBody, type ListWaiversQuery, type UpdateWaiverBody } from './waivers.schema.js';
import * as service from './waivers.service.js';

const HOUR = 60 * 60 * 1000;
// Public signing: limit submissions per IP (hour and day windows), like questionnaires.
const perHour = createRateLimiter({ windowMs: HOUR, limit: env.WAIVER_RATE_PER_HOUR });
const perDay = createRateLimiter({ windowMs: 24 * HOUR, limit: env.WAIVER_RATE_PER_DAY });

/** Public. ETag = content hash; browsers/CDNs may cache for 5 minutes and revalidate (304 via Express). */
const current: RequestHandler = (_req, res) => {
  res.set('ETag', `"${CURRENT_HASH}"`);
  res.set('Cache-Control', 'public, max-age=300');
  ok(res, service.currentWaiver());
};

const sign: RequestHandler = async (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  created(res, await service.signWaiver({ body, ip: req.ip, userAgent: req.get('user-agent') }));
};

const listAll: RequestHandler = async (req, res) => {
  const query = req.query as ListWaiversQuery;
  const pagination = parsePagination(query);
  const { items, total } = await service.listWaivers(query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};
const getOne: RequestHandler<{ id: string }> = async (req, res) => ok(res, await service.getWaiver(req.params.id));
const update: RequestHandler<{ id: string }> = async (req, res) =>
  ok(res, await service.updateWaiver(req.params.id, req.body as UpdateWaiverBody));

/** Printable HTML record. Opened by the app in a browser tab, hence ?token= support (see requireAuthOrQueryToken). */
const document: RequestHandler<{ id: string }> = async (req, res) => {
  const [waiver, settings] = await Promise.all([service.findWaiver(req.params.id), loadSettings()]);
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex');
  res.type('html').send(renderWaiverDocument(waiver, settings.timezone));
};

export const waiversRouter = Router();

// GET /current and POST / are public. Reading signed waivers: admin + staff. Linking (PATCH): admin. No DELETE.
waiversRouter.route('/current').get(current).all(methodNotAllowed);
waiversRouter
  .route('/')
  .post(perHour, perDay, sign)
  .get(requireAuth, requireRole('admin', 'staff'), validate({ query: listWaiversQuery }), listAll)
  .all(methodNotAllowed);
waiversRouter
  .route('/:id')
  .get(requireAuth, requireRole('admin', 'staff'), validate({ params: idParams }), getOne)
  .patch(requireAuth, requireRole('admin'), validate({ params: idParams, body: updateWaiverBody }), update)
  .all(methodNotAllowed);
waiversRouter
  .route('/:id/document')
  .get(requireAuthOrQueryToken, requireRole('admin', 'staff'), validate({ params: idParams }), document)
  .all(methodNotAllowed);
