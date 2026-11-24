import type { RequestHandler } from 'express';

/** Unknown routes -> 404 ROUTE_NOT_FOUND. */
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'This endpoint does not exist.' } });
};
