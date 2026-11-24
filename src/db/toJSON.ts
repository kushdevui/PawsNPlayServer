/** Internal/secret fields that must never appear in an API response. */
const HIDDEN_FIELDS = ['_id', '__v', 'password', 'passwordHash', 'tokenHash', 'tokenVersion'];

/**
 * Safety net for toJSON(): `_id` -> `id` (hex string), no `__v`, no secrets. API responses are built by
 * the explicit serializers in each module (*.serializer.ts), which is what the contract tests check.
 */
export function toPublic(_doc: unknown, ret: object): Record<string, unknown> {
  const source = ret as Record<string, unknown>;
  const out: Record<string, unknown> = { id: source._id == null ? source._id : String(source._id) };
  for (const [key, value] of Object.entries(source)) {
    if (!HIDDEN_FIELDS.includes(key)) out[key] = value;
  }
  return out;
}

/** All collections: timestamps (createdAt/updatedAt), no __v (spec §6). */
export const baseSchemaOptions = {
  versionKey: false,
  timestamps: true,
  // toJSON only: toObject() stays raw so services can still read internal fields (e.g. passwordHash).
  toJSON: { transform: toPublic },
} as const;
