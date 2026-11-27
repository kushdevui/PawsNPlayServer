import type { Types } from 'mongoose';
import type { QuestionnaireDoc, QuestionnaireFileDoc, QuestionnaireStatus } from './questionnaires.model.js';

export interface PublicQuestionnaireFile {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

/** GET /questionnaires/:id. ipHash and userAgent are internal and never returned. */
export interface PublicQuestionnaire {
  id: string;
  status: QuestionnaireStatus;
  answers: Record<string, string | boolean>;
  documents: PublicQuestionnaireFile[];
  dogId: string | null;
  reviewedBy: string | null;
  /** Name of the reviewer (null when not reviewed, or the user no longer exists). */
  reviewedByName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One row of GET /questionnaires. */
export interface QuestionnaireListItem {
  id: string;
  status: QuestionnaireStatus;
  createdAt: Date;
  dogName: string;
  breed: string;
  ownerName: string;
  ownerPhone: string;
  documentsCount: number;
}

const hex = (id: Types.ObjectId | null | undefined): string | null => (id ? id.toHexString() : null);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const serializeFile = (f: QuestionnaireFileDoc): PublicQuestionnaireFile => ({
  id: f._id.toHexString(),
  name: f.name,
  uri: f.uri,
  mimeType: f.mimeType,
  size: f.size,
  uploadedAt: f.uploadedAt,
});

export const serializeQuestionnaire = (q: QuestionnaireDoc, reviewedByName: string | null = null): PublicQuestionnaire => ({
  id: q._id.toHexString(),
  status: q.status,
  answers: q.answers ?? {},
  documents: (q.documents ?? []).map(serializeFile),
  dogId: hex(q.dogId),
  reviewedBy: hex(q.reviewedBy),
  reviewedByName: q.reviewedBy ? reviewedByName : null,
  reviewedAt: q.reviewedAt ?? null,
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
});

export const serializeQuestionnaireListItem = (q: QuestionnaireDoc): QuestionnaireListItem => ({
  id: q._id.toHexString(),
  status: q.status,
  createdAt: q.createdAt,
  dogName: str(q.answers?.dogName),
  breed: str(q.answers?.breed),
  ownerName: str(q.answers?.ownerName),
  ownerPhone: str(q.answers?.ownerPhone),
  documentsCount: (q.documents ?? []).length,
});
