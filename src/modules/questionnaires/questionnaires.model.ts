import { Schema, model, type Types } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';

export const QUESTIONNAIRE_STATUSES = ['new', 'reviewed', 'archived'] as const;
export type QuestionnaireStatus = (typeof QUESTIONNAIRE_STATUSES)[number];

/** A file sent with the questionnaire (stored via the uploads provider under questionnaires/...). */
export interface QuestionnaireFileDoc {
  _id: Types.ObjectId;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

/**
 * A public "Know Your Dog" submission (web/know-your-dog). `answers` holds the validated, whitelisted
 * answers (see questionnaires.schema.ts). No raw IP is stored - only an HMAC-SHA256 of it.
 */
export interface QuestionnaireDoc {
  _id: Types.ObjectId;
  answers: Record<string, string | boolean>;
  documents: QuestionnaireFileDoc[];
  status: QuestionnaireStatus;
  dogId: Types.ObjectId | null;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<QuestionnaireFileDoc>(
  {
    name: { type: String, required: true },
    uri: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    uploadedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

const questionnaireSchema = new Schema<QuestionnaireDoc>(
  {
    answers: { type: Schema.Types.Mixed, required: true },
    documents: { type: [fileSchema], default: [] },
    status: { type: String, enum: QUESTIONNAIRE_STATUSES, default: 'new' },
    dogId: { type: Schema.Types.ObjectId, ref: 'Dog', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 300 },
  },
  { ...baseSchemaOptions, collection: 'questionnaires', minimize: false },
);

questionnaireSchema.index({ createdAt: -1 });
questionnaireSchema.index({ status: 1, createdAt: -1 });
questionnaireSchema.index({ 'answers.ownerPhone': 1 });

export const QuestionnaireModel = model<QuestionnaireDoc>('Questionnaire', questionnaireSchema);
