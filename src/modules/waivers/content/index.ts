import { createHash } from 'node:crypto';
import type { WaiverDefinition } from './types.js';
import { WAIVER_2026_11 } from './v2026-11.js';

export type { WaiverBlock, WaiverConsent, WaiverContent, WaiverDefinition, WaiverPart } from './types.js';

/** JSON with object keys sorted at every level, so the hash doesn't depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** sha256 (hex) of the canonical JSON of { content, consents } - consent labels are part of what is signed. */
export const hashWaiver = (definition: WaiverDefinition): string =>
  createHash('sha256')
    .update(canonicalJson({ content: definition.content, consents: definition.consents }))
    .digest('hex');

/** The version people sign today. To publish a new one: add a file, point this at it, keep the old file. */
export const CURRENT_WAIVER: WaiverDefinition = WAIVER_2026_11;
export const CURRENT_VERSION = CURRENT_WAIVER.content.version;
/** Computed once at startup. */
export const CURRENT_HASH = hashWaiver(CURRENT_WAIVER);
