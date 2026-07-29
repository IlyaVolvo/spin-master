import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

function isQuietPath(path: string): boolean {
  return (
    path === '/api/health' ||
    path === '/health' ||
    path.endsWith('/preregistration/pending-count') ||
    path.endsWith('/stage-counts') ||
    path === '/api/auth/member/me' ||
    path === '/member/me'
  );
}

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  const quiet = isQuietPath(req.path);
  const requestPath = req.path;
  const isGet = req.method === 'GET' || req.method === 'HEAD';

  if (!quiet) {
    const incoming = {
      requestId,
      method: req.method,
      path: requestPath,
      query: req.query,
      body: !isGet ? sanitizeBody(req.body) : undefined,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
    if (isGet) {
      logger.debug('Incoming request', incoming);
    } else {
      logger.info('Incoming request', incoming);
    }
  }

  // Capture response
  const originalSend = res.send;
  res.send = function (body: any) {
    const duration = Date.now() - startTime;
    const responseSize = Buffer.byteLength(JSON.stringify(body || ''), 'utf8');
    const statusCode = res.statusCode;
    const failed = statusCode >= 400;

    if (failed) {
      logger.warn('Request failed', {
        requestId,
        method: req.method,
        path: requestPath,
        statusCode,
        duration: `${duration}ms`,
        responseSize: `${(responseSize / 1024).toFixed(2)}KB`,
        error: typeof body === 'string' ? body.substring(0, 200) : body,
      });
    } else if (!quiet) {
      const completed = {
        requestId,
        method: req.method,
        path: requestPath,
        statusCode,
        duration: `${duration}ms`,
        responseSize: `${(responseSize / 1024).toFixed(2)}KB`,
      };
      if (isGet) {
        logger.debug('Request completed', completed);
      } else {
        logger.info('Request completed', completed);
      }
    }

    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId,
        method: req.method,
        path: requestPath,
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
