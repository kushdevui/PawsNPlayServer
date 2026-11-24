import type { RequestHandler } from 'express';
import { pingDb } from '../../db/connect.js';
import { ok } from '../../utils/respond.js';

/**
 * GET /health (spec §7.1) -> 200 { data: { status: 'ok', time, db: 'connected' } } after a DB ping;
 * 503 DB_UNAVAILABLE when MongoDB does not answer.
 */
export const getHealth: RequestHandler = async (_req, res) => {
  if (!(await pingDb())) {
    res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'The database is not reachable right now.' } });
    return;
  }
  ok(res, { status: 'ok', time: new Date().toISOString(), db: 'connected' });
};
