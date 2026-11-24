import type { RequestHandler } from 'express';

/** Known path, wrong method -> 405 METHOD_NOT_ALLOWED. Add with `router.route(path)....all(methodNotAllowed)`. */
export const methodNotAllowed: RequestHandler = (req, res) => {
  res.status(405).json({
    error: { code: 'METHOD_NOT_ALLOWED', message: `${req.method} is not allowed on this endpoint.` },
  });
};
