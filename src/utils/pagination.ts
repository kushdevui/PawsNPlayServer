export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

const toInt = (value: unknown): number => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

/**
 * Lenient like the app's mock `list()` helper: missing/invalid values fall back to defaults,
 * page >= 1, 1 <= limit <= 100.
 */
export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = Math.max(1, toInt(query.page) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, toInt(query.limit) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}
