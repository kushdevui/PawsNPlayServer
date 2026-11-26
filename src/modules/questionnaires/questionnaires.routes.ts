import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../../config/env.js';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import { parsePagination } from '../../utils/pagination.js';
import { created, list, ok } from '../../utils/respond.js';
import { idParams } from '../../utils/schemas.js';
import { MAX_FILE_BYTES } from '../dogs/dogs.model.js';
import { isAllowedMime } from '../uploads/uploads.routes.js';
import {
  listQuestionnairesQuery,
  updateQuestionnaireBody,
  type ListQuestionnairesQuery,
  type UpdateQuestionnaireBody,
} from './questionnaires.schema.js';
import * as service from './questionnaires.service.js';

export const MAX_QUESTIONNAIRE_FILES = 5;
const HOUR = 60 * 60 * 1000;

// Public endpoint: limit submissions per IP (hour and day windows).
const perHour = createRateLimiter({ windowMs: HOUR, limit: env.QUESTIONNAIRE_RATE_PER_HOUR });
const perDay = createRateLimiter({ windowMs: 24 * HOUR, limit: env.QUESTIONNAIRE_RATE_PER_DAY });

type UploadRequest = Request & { lastFileName?: string };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: MAX_QUESTIONNAIRE_FILES,
    fields: 10,
    fieldSize: 256 * 1024, // the answers JSON
  },
  fileFilter: (req, file, callback) => {
    (req as UploadRequest).lastFileName = file.originalname;
    if (file.fieldname !== 'documents') {
      callback(AppError.validation('Please attach files as documents.'));
      return;
    }
    if (!isAllowedMime(file.mimetype)) {
      callback(AppError.validation(`${file.originalname} is not a photo or PDF.`));
      return;
    }
    callback(null, true);
  },
});

/** multer with its errors turned into short 422 messages the page can show. */
const receiveForm: RequestHandler = (req, res, next) => {
  upload.array('documents', MAX_QUESTIONNAIRE_FILES)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const name = (req as UploadRequest).lastFileName ?? 'A file';
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `${name} is bigger than 10 MB.`
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `You can add up to ${MAX_QUESTIONNAIRE_FILES} files.`
            : 'Your form is too large. Please shorten your answers and try again.';
      next(AppError.validation(message));
      return;
    }
    next(err);
  });
};

const submit: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const files = (Array.isArray(req.files) ? req.files : []).map((f) => ({
    buffer: f.buffer,
    originalName: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
  }));
  const result = await service.submitQuestionnaire({
    answersJson: body.answers,
    honeypot: body.website,
    files,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    origin: `${req.protocol}://${req.get('host') ?? 'localhost'}`,
  });
  created(res, result);
};

const listAll: RequestHandler = async (req, res) => {
  const query = req.query as ListQuestionnairesQuery;
  const pagination = parsePagination(query);
  const { items, total } = await service.listQuestionnaires(query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};
const getOne: RequestHandler<{ id: string }> = async (req, res) =>
  ok(res, await service.getQuestionnaire(req.params.id));
const update: RequestHandler<{ id: string }> = async (req, res) =>
  ok(res, await service.updateQuestionnaire(authUser(req), req.params.id, req.body as UpdateQuestionnaireBody));

export const questionnairesRouter = Router();

// POST is public (the "Know Your Dog" page). Reading: admin + staff. Updating: admin.
questionnairesRouter
  .route('/')
  .post(perHour, perDay, receiveForm, submit)
  .get(requireAuth, requireRole('admin', 'staff'), validate({ query: listQuestionnairesQuery }), listAll)
  .all(methodNotAllowed);
questionnairesRouter
  .route('/:id')
  .get(requireAuth, requireRole('admin', 'staff'), validate({ params: idParams }), getOne)
  .patch(
    requireAuth,
    requireRole('admin'),
    validate({ params: idParams, body: updateQuestionnaireBody }),
    update,
  )
  .all(methodNotAllowed);
