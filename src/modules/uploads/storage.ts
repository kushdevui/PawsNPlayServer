import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

export interface StoredFile {
  /** Storage key, e.g. dogs/2026/11/<uuid>-card.pdf */
  key: string;
  /** URL the app can open. */
  url: string;
}

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  /** Origin to build absolute URLs for local storage, e.g. http://192.168.1.20:4000 */
  origin: string;
}

/** Absolute directory for local uploads (UPLOAD_DIR, relative to the project root/cwd). */
export const localUploadRoot = () => path.resolve(process.cwd(), env.UPLOAD_DIR);

/** File name safe for paths and URLs: letters, digits, dot, dash, underscore; max 80 chars. */
export function safeFileName(name: string): string {
  const base = path.basename(name).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
  const trimmed = base.replace(/^[-.]+/, '').slice(-80);
  return trimmed || 'file';
}

/** Spec §7.11 key layout: dogs/<yyyy>/<mm>/<uuid>-<safeName>. */
export function storageKey(originalName: string, at = new Date()): string {
  const yyyy = String(at.getUTCFullYear());
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `dogs/${yyyy}/${mm}/${randomUUID()}-${safeFileName(originalName)}`;
}

async function saveLocal({ buffer, originalName, origin }: UploadInput): Promise<StoredFile> {
  const key = storageKey(originalName);
  const target = path.join(localUploadRoot(), ...key.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer, { flag: 'wx' });
  const base = env.PUBLIC_BASE_URL ?? origin;
  return { key, url: `${base}/uploads/${key.split('/').map(encodeURIComponent).join('/')}` };
}

/**
 * TODO(uploads): S3 - PutObject to S3_BUCKET under `key` (public-read CDN URL, or a long-lived signed URL plus
 * GET /uploads/:key redirecting to a fresh signed URL). Needs @aws-sdk/client-s3; not installed yet.
 */
async function saveS3(): Promise<StoredFile> {
  const configured = env.S3_BUCKET && env.S3_REGION && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY;
  if (!configured) throw new AppError(500, 'UPLOADS_NOT_CONFIGURED', 'File storage is not set up on the server.');
  throw new AppError(501, 'NOT_IMPLEMENTED', 'File uploads to cloud storage are not available yet.');
}

/** TODO(uploads): Cloudinary - upload the buffer and return the secure_url. Needs the cloudinary SDK. */
async function saveCloudinary(): Promise<StoredFile> {
  if (!env.CLOUDINARY_URL) {
    throw new AppError(500, 'UPLOADS_NOT_CONFIGURED', 'File storage is not set up on the server.');
  }
  throw new AppError(501, 'NOT_IMPLEMENTED', 'File uploads to cloud storage are not available yet.');
}

/** Stores the file with the configured provider (UPLOAD_PROVIDER). */
export function storeFile(input: UploadInput): Promise<StoredFile> {
  switch (env.UPLOAD_PROVIDER) {
    case 'local':
      return saveLocal(input);
    case 's3':
      return saveS3();
    case 'cloudinary':
      return saveCloudinary();
    default:
      throw new AppError(500, 'UPLOADS_NOT_CONFIGURED', 'File storage is not set up on the server.');
  }
}
