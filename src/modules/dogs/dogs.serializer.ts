import { idOf } from '../../utils/objectId.js';
import type { DocumentKind, DogDoc, DogStatus, Gender, Temperament } from './dogs.model.js';

export interface PublicDogDocument {
  id: string;
  kind: DocumentKind;
  name: string;
  uri: string;
  mimeType: string;
  size: number | null;
  uploadedAt: Date;
}

/** App `Dog` (spec §6.2 Dog JSON). */
export interface PublicDog {
  id: string;
  name: string;
  breed: string;
  gender: Gender;
  dateOfBirth: string | null;
  weightKg: number | null;
  color: string;
  ownerId: string | null;
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
  documents: PublicDogDocument[];
  status: DogStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** App `DogSummary` used in Booking JSON. */
export interface DogSummary {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  ownerPhone: string;
}

export const serializeDog = (d: DogDoc): PublicDog => ({
  id: d._id.toHexString(),
  name: d.name,
  breed: d.breed ?? '',
  gender: d.gender,
  dateOfBirth: d.dateOfBirth ?? null,
  weightKg: d.weightKg ?? null,
  color: d.color ?? '',
  ownerId: idOf(d.ownerId),
  ownerName: d.ownerName,
  ownerPhone: d.ownerPhone,
  vaccinated: Boolean(d.vaccinated),
  vaccinationExpiry: d.vaccinationExpiry ?? null,
  neutered: Boolean(d.neutered),
  temperament: d.temperament,
  feedingNotes: d.feedingNotes ?? '',
  medicalNotes: d.medicalNotes ?? '',
  notes: d.notes ?? '',
  photoUrl: d.photoUrl ?? null,
  documents: (d.documents ?? []).map((doc) => ({
    id: String(doc._id),
    kind: doc.kind,
    name: doc.name,
    uri: doc.uri,
    mimeType: doc.mimeType,
    size: doc.size ?? null,
    uploadedAt: doc.uploadedAt,
  })),
  status: d.status,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

export const summarizeDog = (d: Pick<DogDoc, '_id' | 'name' | 'breed' | 'ownerName' | 'ownerPhone'>): DogSummary => ({
  id: d._id.toHexString(),
  name: d.name,
  breed: d.breed ?? '',
  ownerName: d.ownerName,
  ownerPhone: d.ownerPhone,
});
