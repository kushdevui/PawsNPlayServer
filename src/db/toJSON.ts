/** Internal/secret fields that must never appear in an API response. */
const HIDDEN_FIELDS = ['_id', '__v', 'password', 'passwordHash', 'tokenHash'];

/**
 * Shared schema options: string `_id` is exposed as `id`, `__v` is not stored, and secrets are
 * stripped from toJSON (what res.json() uses). Dates serialize as ISO 8601 UTC strings via JSON.stringify.
 */
export function toPublic(_doc: unknown, ret: object): Record<string, unknown> {
  const source = ret as Record<string, unknown>;
  const out: Record<string, unknown> = { id: source._id };
  for (const [key, value] of Object.entries(source)) {
    if (!HIDDEN_FIELDS.includes(key)) out[key] = value;
  }
  return out;
}

export const baseSchemaOptions = {
  versionKey: false,
  // toJSON only: toObject() stays raw so services can still read internal fields (e.g. passwordHash).
  toJSON: { transform: toPublic },
} as const;
