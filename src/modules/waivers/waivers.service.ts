import { createHmac } from 'node:crypto';
import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { now } from '../../utils/clock.js';
import { isObjectId } from '../../utils/objectId.js';
import type { Pagination } from '../../utils/pagination.js';
import { escapeRegex } from '../../utils/regex.js';
import { DogModel } from '../dogs/dogs.model.js';
import { QuestionnaireModel } from '../questionnaires/questionnaires.model.js';
import { CURRENT_HASH, CURRENT_VERSION, CURRENT_WAIVER } from './content/index.js';
import { WaiverModel, type WaiverDoc } from './waivers.model.js';
import type { ListWaiversQuery, UpdateWaiverBody } from './waivers.schema.js';
import {
  serializeWaiver,
  serializeWaiverListItem,
  type PublicWaiver,
  type WaiverListItem,
} from './waivers.serializer.js';
import { parseSignature, signatureToSvg } from './waivers.signature.js';

export const OUTDATED_MESSAGE = 'The waiver was updated. Please reload the page and sign again.';
export const TYPED_SIGNATURE_MESSAGE = 'Please type your full name exactly as above to sign.';
const PHONE = /^[0-9+\- ]{7,20}$/;

/** GET /waivers/current payload. */
export function currentWaiver() {
  return {
    version: CURRENT_VERSION,
    contentHash: CURRENT_HASH,
    content: CURRENT_WAIVER.content,
    consents: CURRENT_WAIVER.consents.map(({ key, label, shortLabel, required }) => ({
      key,
      label,
      shortLabel,
      required,
    })),
  };
}

/** Same HMAC scheme as questionnaires: the stored hash can't be reversed by trying every IPv4 address. */
const hashIp = (ip: string | undefined): string | null =>
  ip ? createHmac('sha256', env.JWT_ACCESS_SECRET).update(`waiver-ip:${ip}`).digest('hex') : null;

/** Trim, collapse inner whitespace, NFC; for comparing names "ignoring case and extra spaces". */
const normaliseName = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
const sameName = (a: string, b: string) => normaliseName(a).toLocaleLowerCase() === normaliseName(b).toLocaleLowerCase();

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? normaliseName(value).slice(0, max) : '';

export interface SignInput {
  body: Record<string, unknown>;
  ip: string | undefined;
  userAgent: string | undefined;
}

/**
 * POST /waivers (public). Checks run in this order so the first message matches what the signer sees:
 * honeypot (fake 201) -> version/hash (409) -> names, phone -> each required consent -> typed signature
 * -> drawn signature -> questionnaireId. signedAt is server time.
 */
export async function signWaiver({ body, ip, userAgent }: SignInput): Promise<{ id: string; signedAt: Date; version: string }> {
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return { id: new Types.ObjectId().toHexString(), signedAt: now(), version: CURRENT_VERSION };
  }
  if (body.version !== CURRENT_VERSION || body.contentHash !== CURRENT_HASH) {
    throw new AppError(409, 'WAIVER_OUTDATED', OUTDATED_MESSAGE, { version: CURRENT_VERSION, contentHash: CURRENT_HASH });
  }

  const parentName = text(body.parentName, 100);
  if (!parentName) throw AppError.validation('Please enter your name.');
  const dogName = text(body.dogName, 60);
  if (!dogName) throw AppError.validation('Please enter your dog’s name.');
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!PHONE.test(phone)) throw AppError.validation('Please enter a valid phone number.');

  const given = (body.consents && typeof body.consents === 'object' ? body.consents : {}) as Record<string, unknown>;
  const consents: Record<string, boolean> = {};
  for (const consent of CURRENT_WAIVER.consents) {
    const value = given[consent.key];
    if (consent.required) {
      if (value !== true) throw AppError.validation(`Please tick: ${consent.shortLabel}`);
      consents[consent.key] = true;
    } else {
      if (value !== undefined && typeof value !== 'boolean') {
        throw AppError.validation('Please check your answers and try again.');
      }
      consents[consent.key] = value === true;
    }
  }

  const typedSignature = text(body.typedSignature, 100);
  if (!typedSignature || !sameName(typedSignature, parentName)) throw AppError.validation(TYPED_SIGNATURE_MESSAGE);

  const signature = parseSignature(body.signature);

  let questionnaireId: Types.ObjectId | null = null;
  if (body.questionnaireId !== undefined && body.questionnaireId !== null && body.questionnaireId !== '') {
    const exists = isObjectId(body.questionnaireId) && (await QuestionnaireModel.exists({ _id: body.questionnaireId }));
    if (!exists) throw AppError.validation('We couldn’t find that Know Your Dog form.');
    questionnaireId = new Types.ObjectId(body.questionnaireId as string);
  }

  const doc = await WaiverModel.create({
    status: 'signed',
    version: CURRENT_VERSION,
    contentHash: CURRENT_HASH,
    snapshot: CURRENT_WAIVER,
    consents,
    parentName,
    dogName,
    phone,
    typedSignature,
    signature,
    signatureSvg: signatureToSvg(signature),
    signedAt: now(),
    ipHash: hashIp(ip),
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
    questionnaireId,
    dogId: null,
  });
  return { id: doc._id.toHexString(), signedAt: doc.signedAt, version: doc.version };
}

/** GET /waivers: newest first; search on parent name, dog name, phone; from/to on signedAt ([from, to)). */
export async function listWaivers(
  { search, from, to }: ListWaiversQuery,
  { skip, limit }: Pagination,
): Promise<{ items: WaiverListItem[]; total: number }> {
  const filter: FilterQuery<WaiverDoc> = {};
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ parentName: pattern }, { dogName: pattern }, { phone: pattern }];
  }
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = from;
    if (to) range.$lt = to;
    filter.signedAt = range;
  }
  const [docs, total] = await Promise.all([
    WaiverModel.find(filter, { snapshot: 0, signature: 0, signatureSvg: 0 })
      .sort({ signedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean<WaiverDoc[]>(),
    WaiverModel.countDocuments(filter),
  ]);
  return { items: docs.map(serializeWaiverListItem), total };
}

/** Raw document (for the printable page) or 404 "Waiver not found". */
export async function findWaiver(id: string): Promise<WaiverDoc> {
  const doc = isObjectId(id) ? await WaiverModel.findById(id).lean<WaiverDoc>() : null;
  if (!doc) throw AppError.notFound('Waiver');
  return doc;
}

export async function getWaiver(id: string): Promise<PublicWaiver> {
  return serializeWaiver(await findWaiver(id));
}

/** PATCH /waivers/:id (admin): only the links. The signed content, consents and signature never change. */
export async function updateWaiver(id: string, { dogId, questionnaireId }: UpdateWaiverBody): Promise<PublicWaiver> {
  await findWaiver(id);
  const set: Record<string, Types.ObjectId | null> = {};
  if (dogId !== undefined) {
    if (dogId !== null && !(await DogModel.exists({ _id: dogId }))) throw AppError.validation('Choose an existing dog.');
    set.dogId = dogId === null ? null : new Types.ObjectId(dogId);
  }
  if (questionnaireId !== undefined) {
    if (questionnaireId !== null && !(await QuestionnaireModel.exists({ _id: questionnaireId }))) {
      throw AppError.validation('Choose an existing Know Your Dog form.');
    }
    set.questionnaireId = questionnaireId === null ? null : new Types.ObjectId(questionnaireId);
  }
  if (Object.keys(set).length > 0) await WaiverModel.updateOne({ _id: id }, { $set: set });
  return getWaiver(id);
}
