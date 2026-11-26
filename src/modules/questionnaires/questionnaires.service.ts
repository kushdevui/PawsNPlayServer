import { createHmac } from 'node:crypto';
import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import { now } from '../../utils/clock.js';
import { isObjectId } from '../../utils/objectId.js';
import type { Pagination } from '../../utils/pagination.js';
import { escapeRegex } from '../../utils/regex.js';
import { DogModel } from '../dogs/dogs.model.js';
import { storeFile } from '../uploads/storage.js';
import { QuestionnaireModel, type QuestionnaireDoc } from './questionnaires.model.js';
import {
  answersSchema,
  type Answers,
  type ListQuestionnairesQuery,
  type UpdateQuestionnaireBody,
} from './questionnaires.schema.js';
import {
  serializeQuestionnaire,
  serializeQuestionnaireListItem,
  type PublicQuestionnaire,
  type QuestionnaireListItem,
} from './questionnaires.serializer.js';

export interface IncomingFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface SubmitInput {
  answersJson: unknown;
  honeypot: unknown;
  files: IncomingFile[];
  ip: string | undefined;
  userAgent: string | undefined;
  origin: string;
}

/** HMAC (keyed with a server secret) so a stored hash can't be reversed by trying every IPv4 address. */
const hashIp = (ip: string | undefined): string | null =>
  ip ? createHmac('sha256', env.JWT_ACCESS_SECRET).update(`questionnaire-ip:${ip}`).digest('hex') : null;

/** Parses and validates the `answers` JSON string; drops unknown keys and empty optional answers. */
export function parseAnswers(raw: unknown): Answers {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw AppError.validation('Please fill in the form before sending.');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw AppError.validation('We could not read your answers. Please try again.');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw AppError.validation('We could not read your answers. Please try again.');
  }
  const result = answersSchema.safeParse(json);
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Please check your answers and try again.');
  }
  const answers: Answers = {};
  for (const [key, value] of Object.entries(result.data as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'boolean') answers[key] = value;
  }
  return answers;
}

/**
 * POST /questionnaires (public). A filled honeypot gets a normal-looking 201 and nothing is stored.
 * Files are stored only after the answers are valid.
 */
export async function submitQuestionnaire(input: SubmitInput): Promise<{ id: string; createdAt: Date }> {
  if (typeof input.honeypot === 'string' && input.honeypot.trim() !== '') {
    return { id: new Types.ObjectId().toHexString(), createdAt: now() };
  }
  const answers = parseAnswers(input.answersJson);

  const documents = [];
  for (const file of input.files) {
    const stored = await storeFile({
      buffer: file.buffer,
      originalName: file.originalName,
      mimeType: file.mimeType,
      origin: input.origin,
      folder: 'questionnaires',
    });
    documents.push({
      _id: new Types.ObjectId(),
      name: file.originalName.slice(0, 255),
      uri: stored.url,
      mimeType: file.mimeType,
      size: file.size,
      uploadedAt: now(),
    });
  }

  const doc = await QuestionnaireModel.create({
    answers,
    documents,
    status: 'new',
    dogId: null,
    reviewedBy: null,
    reviewedAt: null,
    ipHash: hashIp(input.ip),
    userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
  });
  return { id: doc._id.toHexString(), createdAt: doc.createdAt };
}

/** GET /questionnaires: newest first; status filter; search on dog name, owner name and owner phone. */
export async function listQuestionnaires(
  { status, search }: ListQuestionnairesQuery,
  { skip, limit }: Pagination,
): Promise<{ items: QuestionnaireListItem[]; total: number }> {
  const filter: FilterQuery<QuestionnaireDoc> = {};
  if (status) filter.status = status;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ 'answers.dogName': pattern }, { 'answers.ownerName': pattern }, { 'answers.ownerPhone': pattern }];
  }
  const [docs, total] = await Promise.all([
    QuestionnaireModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean<QuestionnaireDoc[]>(),
    QuestionnaireModel.countDocuments(filter),
  ]);
  return { items: docs.map(serializeQuestionnaireListItem), total };
}

async function findQuestionnaire(id: string) {
  const doc = isObjectId(id) ? await QuestionnaireModel.findById(id) : null;
  if (!doc) throw AppError.notFound('Questionnaire');
  return doc;
}

export async function getQuestionnaire(id: string): Promise<PublicQuestionnaire> {
  return serializeQuestionnaire(await findQuestionnaire(id));
}

/**
 * PATCH /questionnaires/:id (admin). Moving away from `new` records who reviewed it and when;
 * moving back to `new` clears that. `dogId` must be an existing dog (null unlinks).
 */
export async function updateQuestionnaire(
  caller: AuthUser,
  id: string,
  { status, dogId }: UpdateQuestionnaireBody,
): Promise<PublicQuestionnaire> {
  const doc = await findQuestionnaire(id);
  if (dogId) {
    if (!(await DogModel.exists({ _id: dogId }))) throw AppError.validation('Choose an existing dog.');
    doc.dogId = new Types.ObjectId(dogId);
  } else if (dogId === null) {
    doc.dogId = null;
  }
  if (status && status !== doc.status) {
    doc.status = status;
    if (status === 'new') {
      doc.reviewedBy = null;
      doc.reviewedAt = null;
    } else {
      doc.reviewedBy = new Types.ObjectId(caller.id);
      doc.reviewedAt = now();
    }
  }
  await doc.save();
  return serializeQuestionnaire(doc);
}
