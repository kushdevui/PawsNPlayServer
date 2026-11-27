import { Schema, model, type Types } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';
import type { WaiverDefinition } from './content/index.js';

/** Drawn signature: strokes of [x, y] points in pixels inside a width x height box. */
export interface WaiverSignature {
  width: number;
  height: number;
  strokes: number[][][];
}

/**
 * A signed "Boarding Consent & Waiver". Everything the signer saw and did is stored and never changes:
 * version, contentHash, a full snapshot of the text + checkbox labels, the ticked consents, names, phone,
 * typed and drawn signature, signedAt (server time), ipHash (HMAC, no raw IP) and userAgent.
 * Only the links (dogId, questionnaireId) can be edited by an admin.
 */
export interface WaiverDoc {
  _id: Types.ObjectId;
  status: 'signed';
  version: string;
  contentHash: string;
  snapshot: WaiverDefinition;
  consents: Record<string, boolean>;
  parentName: string;
  dogName: string;
  phone: string;
  typedSignature: string;
  signature: WaiverSignature;
  signatureSvg: string;
  signedAt: Date;
  ipHash: string | null;
  userAgent: string | null;
  questionnaireId: Types.ObjectId | null;
  dogId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const waiverSchema = new Schema<WaiverDoc>(
  {
    status: { type: String, enum: ['signed'], default: 'signed' },
    version: { type: String, required: true },
    contentHash: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    consents: { type: Schema.Types.Mixed, required: true },
    parentName: { type: String, required: true },
    dogName: { type: String, required: true },
    phone: { type: String, required: true },
    typedSignature: { type: String, required: true },
    signature: { type: Schema.Types.Mixed, required: true },
    signatureSvg: { type: String, required: true },
    signedAt: { type: Date, required: true },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: null },
    questionnaireId: { type: Schema.Types.ObjectId, ref: 'Questionnaire', default: null },
    dogId: { type: Schema.Types.ObjectId, ref: 'Dog', default: null },
  },
  { ...baseSchemaOptions, collection: 'waivers', minimize: false },
);

waiverSchema.index({ signedAt: -1 });
waiverSchema.index({ phone: 1 });
waiverSchema.index({ dogId: 1 });
waiverSchema.index({ questionnaireId: 1 });

export const WaiverModel = model<WaiverDoc>('Waiver', waiverSchema);
