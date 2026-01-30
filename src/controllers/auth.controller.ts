import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { SignupRequest, LoginRequest } from '../types/auth.types';
import { ValidationError } from '../types/error.types';
import logger from '../utils/logger';

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async signup(req: Request, res: Response) {
    try {
      const { email, password } = req.body as SignupRequest;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      if (password.length < 6) {
        throw new ValidationError('Password must be at least 6 characters');
      }

      const result = await this.authService.signup(email, password);

      res.status(201).json({
        message: 'Account created successfully',
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        email: result.email,
        uid: result.localId,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body as LoginRequest;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const result = await this.authService.login(email, password);

      res.json({
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        email: result.email,
        uid: result.localId,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getCurrentUser(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const user = await this.authService.getUserById(req.user.uid);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        uid: user.uid,
        email: user.email,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  private handleError(error: any, res: Response) {
    logger.error('Auth controller error', { error: error.message });

    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message?.includes('Invalid email or password')) {
      return res.status(401).json({ error: error.message });
    }

    if (error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    if (error.message?.includes('disabled')) {
      return res.status(403).json({ error: error.message });
    }

    if (error.message?.includes('Too many')) {
      return res.status(429).json({ error: error.message });
    }

    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
