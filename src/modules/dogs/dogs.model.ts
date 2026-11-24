import { Schema, Types, model } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';

export const GENDERS = ['male', 'female'] as const;
export const TEMPERAMENTS = ['friendly', 'shy', 'reactive'] as const;
export const DOG_STATUSES = ['active', 'archived'] as const;
export const DOCUMENT_KINDS = ['vaccination', 'other'] as const;
export const MAX_DOCUMENTS = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = /^(image\/|application\/pdf)/;

export type Gender = (typeof GENDERS)[number];
export type Temperament = (typeof TEMPERAMENTS)[number];
export type DogStatus = (typeof DOG_STATUSES)[number];
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Embedded DogDocument (spec §6.2). `_id` is a string so the app's own temporary ids can be kept. */
export interface DogDocumentDoc {
  _id: string;
  kind: DocumentKind;
  name: string;
  uri: string;
  mimeType: string;
  size: number | null;
  uploadedAt: Date;
}

/** Stored shape (spec §6.2). Public shape = app `Dog` (dogs.serializer.ts). */
export interface DogDoc {
  _id: Types.ObjectId;
  name: string;
  breed: string;
  gender: Gender;
  dateOfBirth: string | null;
  weightKg: number | null;
  color: string;
  ownerId: Types.ObjectId | null;
  ownerName: string;
  ownerPhone: string;
  vaccinated: boolean;
  vaccinationExpiry: string | null;
  neutered: boolean;
  temperament: Temperament;
  feedingNotes: string;
  medicalNotes: string;
  notes: string;
  photoUrl: string | null;
  documents: DogDocumentDoc[];
  status: DogStatus;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<DogDocumentDoc>(
  {
    _id: { type: String, default: () => new Types.ObjectId().toHexString() },
    kind: { type: String, enum: DOCUMENT_KINDS, default: 'vaccination' },
    name: { type: String, required: true },
    uri: { type: String, required: true },
    mimeType: { type: String, required: true, match: ALLOWED_MIME },
    size: { type: Number, default: null, max: MAX_FILE_BYTES },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const dogSchema = new Schema<DogDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    breed: { type: String, default: '' },
    gender: { type: String, enum: GENDERS, default: 'male' },
    dateOfBirth: { type: String, default: null, match: DATE_ONLY },
    weightKg: { type: Number, default: null, min: 0 },
    color: { type: String, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ownerName: { type: String, required: true, trim: true },
    ownerPhone: { type: String, required: true, trim: true },
    vaccinated: { type: Boolean, default: false },
    vaccinationExpiry: { type: String, default: null, match: DATE_ONLY },
    neutered: { type: Boolean, default: false },
    temperament: { type: String, enum: TEMPERAMENTS, default: 'friendly' },
    feedingNotes: { type: String, default: '' },
    medicalNotes: { type: String, default: '' },
    notes: { type: String, default: '' },
    photoUrl: { type: String, default: null },
    documents: {
      type: [documentSchema],
      default: [],
      validate: { validator: (docs: unknown[]) => docs.length <= MAX_DOCUMENTS, message: 'Up to 10 documents per dog.' },
    },
    status: { type: String, enum: DOG_STATUSES, default: 'active' },
  },
  { ...baseSchemaOptions, collection: 'dogs' },
);

dogSchema.index({ status: 1, name: 1 });
dogSchema.index({ ownerId: 1 });

export const DogModel = model<DogDoc>('Dog', dogSchema);
