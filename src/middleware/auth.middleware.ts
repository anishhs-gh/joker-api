import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import logger from '../utils/logger';

export function createAuthMiddleware(authService: AuthService | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // If auth service is not configured, continue without auth
    if (!authService) {
      req.user = null;
      req.authType = undefined;
      return next();
    }

    // Check for API key header first
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      try {
        const user = await authService.verifyApiToken(apiKey);
        if (user) {
          req.user = user;
          req.authType = 'apikey';
          logger.debug('User authenticated via API key', { uid: user.uid, email: user.email });
          return next();
        }
      } catch (error) {
        logger.debug('API key verification failed', { error: (error as Error).message });
      }
    }

    // Check for Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const user = await authService.verifyIdToken(token);
        if (user) {
          // Fetch additional user info from user record
          const userRecord = await authService.getUserRecord(user.uid);
          if (userRecord) {
            user.name = userRecord.name;
          }
          req.user = user;
          req.authType = 'firebase';
          logger.debug('User authenticated via Firebase token', { uid: user.uid, email: user.email });
          return next();
        }
      } catch (error) {
        logger.debug('Token verification failed', { error: (error as Error).message });
      }
    }

    req.user = null;
    req.authType = undefined;
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireFullAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.authType !== 'firebase') {
    return res.status(403).json({ error: 'Full authentication required. API keys cannot access this endpoint.' });
  }
  next();
}
