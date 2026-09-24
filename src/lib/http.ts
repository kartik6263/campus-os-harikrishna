import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';

/** An error with an HTTP status the error handler will honour. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'error',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(msg = 'Bad request', details?: unknown) {
    return new ApiError(400, msg, 'bad_request', details);
  }
  static unauthorized(msg = 'Authentication required') {
    return new ApiError(401, msg, 'unauthorized');
  }
  static forbidden(msg = 'You do not have permission to do that') {
    return new ApiError(403, msg, 'forbidden');
  }
  static notFound(msg = 'Not found') {
    return new ApiError(404, msg, 'not_found');
  }
  static conflict(msg = 'Conflict', details?: unknown) {
    return new ApiError(409, msg, 'conflict', details);
  }
}

/**
 * Express 5 forwards rejected promises to the error handler on its own, but
 * wrapping keeps the typing tidy and the intent explicit at each route.
 */
export const asyncHandler =
  <T extends RequestHandler>(fn: T): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };

type Source = 'body' | 'query' | 'params';

/**
 * Validates one part of the request and replaces it with the parsed value, so
 * handlers read typed data rather than raw strings.
 */
export function validate<S extends ZodType>(source: Source, schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(ApiError.badRequest('Request validation failed', formatZod(result.error)));
      return;
    }
    // req.query is a getter in Express 5, so assign onto a scratch property
    // the handlers read instead of mutating the original.
    if (source === 'query') {
      (req as Request & { valid?: unknown }).valid = result.data;
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

/** Reads the value stashed by `validate('query', …)`. */
export const validQuery = <T>(req: Request): T => (req as Request & { valid: T }).valid;

function formatZod(error: ZodError) {
  return error.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    message: i.message,
  }));
}

/** Terminal error handler — must be registered last. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'bad_request', message: 'Request validation failed', details: formatZod(err) },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  // Log the whole thing server-side; return something safe to the client.
  console.error('[unhandled]', err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` },
  });
}
