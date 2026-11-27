import type { Types } from 'mongoose';
import type { WaiverContent } from './content/index.js';
import type { WaiverDoc, WaiverSignature } from './waivers.model.js';

/** One row of GET /waivers. */
export interface WaiverListItem {
  id: string;
  signedAt: Date;
  parentName: string;
  dogName: string;
  phone: string;
  version: string;
  photosOptOut: boolean;
  questionnaireId: string | null;
  dogId: string | null;
}

export interface WaiverConsentResult {
  key: string;
  label: string;
  required: boolean;
  value: boolean;
}

/** GET /waivers/:id (admin, staff). ipHash is never returned. */
export interface PublicWaiver {
  id: string;
  status: 'signed';
  version: string;
  contentHash: string;
  signedAt: Date;
  parentName: string;
  dogName: string;
  phone: string;
  consents: WaiverConsentResult[];
  photosOptOut: boolean;
  typedSignature: string;
  signature: WaiverSignature;
  signatureSvg: string;
  content: WaiverContent;
  userAgent: string | null;
  questionnaireId: string | null;
  dogId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const hex = (id: Types.ObjectId | null | undefined): string | null => (id ? id.toHexString() : null);

export const serializeWaiverListItem = (w: WaiverDoc): WaiverListItem => ({
  id: w._id.toHexString(),
  signedAt: w.signedAt,
  parentName: w.parentName,
  dogName: w.dogName,
  phone: w.phone,
  version: w.version,
  photosOptOut: w.consents?.photosOptOut === true,
  questionnaireId: hex(w.questionnaireId),
  dogId: hex(w.dogId),
});

/** Consents with the labels from the stored snapshot (the exact wording the signer saw). */
export const consentResults = (w: WaiverDoc): WaiverConsentResult[] =>
  (w.snapshot?.consents ?? []).map((c) => ({
    key: c.key,
    label: c.label,
    required: c.required,
    value: w.consents?.[c.key] === true,
  }));

export const serializeWaiver = (w: WaiverDoc): PublicWaiver => ({
  id: w._id.toHexString(),
  status: w.status,
  version: w.version,
  contentHash: w.contentHash,
  signedAt: w.signedAt,
  parentName: w.parentName,
  dogName: w.dogName,
  phone: w.phone,
  consents: consentResults(w),
  photosOptOut: w.consents?.photosOptOut === true,
  typedSignature: w.typedSignature,
  signature: w.signature,
  signatureSvg: w.signatureSvg,
  content: w.snapshot.content,
  userAgent: w.userAgent ?? null,
  questionnaireId: hex(w.questionnaireId),
  dogId: hex(w.dogId),
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});
