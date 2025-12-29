import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Log request details
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Capture response
  const originalSend = res.send;
  res.send = function (body: any) {
    const duration = Date.now() - startTime;
    const responseSize = Buffer.byteLength(JSON.stringify(body || ''), 'utf8');

    // Log response details
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: `${(responseSize / 1024).toFixed(2)}KB`,
      ...(res.statusCode >= 400 && {
        error: typeof body === 'string' ? body.substring(0, 200) : body,
      }),
    });

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId,
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

// Sanitize sensitive data from request body
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'authorization'];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }

  return sanitized;
}

