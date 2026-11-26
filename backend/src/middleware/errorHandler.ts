import type { Request, Response, NextFunction } from 'express';
import { QueueEngineError } from '../services/tokenEngine.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof QueueEngineError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'CastError') {
    res.status(400).json({ error: 'Invalid resource identifier', code: 'INVALID_ID' });
    return;
  }

  if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
    res.status(409).json({ error: 'Duplicate resource conflict', code: 'CONFLICT' });
    return;
  }

  logger.error('Unhandled request error', {
    message: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}
