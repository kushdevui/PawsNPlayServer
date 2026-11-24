import type { Response } from 'express';

export interface ListMeta {
  total: number;
  page: number;
  limit: number;
}

/** `{ data }` with 200 (or a custom status). */
export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

/** `{ data }` with 201. */
export function created<T>(res: Response, data: T): void {
  ok(res, data, 201);
}

/** `{ data: [...], meta: { total, page, limit } }`. */
export function list<T>(res: Response, data: T[], meta: ListMeta): void {
  res.status(200).json({ data, meta: { total: meta.total, page: meta.page, limit: meta.limit } });
}
