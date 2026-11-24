import { Types } from 'mongoose';

/** True for a 24-char hex Mongo ObjectId string. Anything else can never match a document. */
export const isObjectId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);

/** Hex id of an ObjectId-like value (or null). */
export const idOf = (value: unknown): string | null => {
  if (value == null) return null;
  if (value instanceof Types.ObjectId) return value.toHexString();
  return String(value);
};
