import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import logger from '../utils/logger';

export function createAuthMiddleware(authService: AuthService | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // If auth service is not configured, continue without auth
    if (!authService) {
      req.user = null;
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const user = await authService.verifyIdToken(token);
      req.user = user;

      if (user) {
        logger.debug('User authenticated', { uid: user.uid, email: user.email });
      }
    } catch (error) {
      logger.debug('Token verification failed', { error: (error as Error).message });
      req.user = null;
    }

    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}
