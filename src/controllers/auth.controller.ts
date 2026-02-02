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
      const { email, password, name } = req.body as SignupRequest;

      if (!email || !password || !name) {
        throw new ValidationError('Email, password, and name are required');
      }

      if (name.trim().length < 2) {
        throw new ValidationError('Name must be at least 2 characters');
      }

      if (password.length < 6) {
        throw new ValidationError('Password must be at least 6 characters');
      }

      const result = await this.authService.signup(email, password, name.trim());

      res.status(201).json({
        message: 'Account created successfully. Please verify your email.',
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        email: result.email,
        uid: result.localId,
        name: result.name,
        avatarColor: result.avatarColor,
        apiToken: result.apiToken,
        emailVerified: false,
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

      // Get user record and email verification status
      const [userRecord, emailVerified] = await Promise.all([
        this.authService.getUserRecord(result.localId),
        this.authService.isEmailVerified(result.localId),
      ]);

      res.json({
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        email: result.email,
        uid: result.localId,
        name: userRecord?.name,
        avatarColor: userRecord?.avatarColor,
        hasApiToken: !!userRecord?.apiTokenHash,
        emailVerified,
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

      const [userRecord, emailVerified] = await Promise.all([
        this.authService.getUserRecord(req.user.uid),
        this.authService.isEmailVerified(req.user.uid),
      ]);

      if (!userRecord) {
        // Fallback to basic info if no user record exists
        return res.json({
          uid: req.user.uid,
          email: req.user.email,
          emailVerified,
        });
      }

      res.json({
        uid: userRecord.uid,
        email: userRecord.email,
        name: userRecord.name,
        avatarColor: userRecord.avatarColor,
        apiTokenCreatedAt: userRecord.apiTokenCreatedAt,
        emailVerified,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async resendVerificationEmail(req: Request, res: Response) {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        throw new ValidationError('idToken is required');
      }

      await this.authService.sendVerificationEmail(idToken);

      res.json({
        message: 'Verification email sent successfully',
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async resetPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ValidationError('Email is required');
      }

      await this.authService.sendPasswordResetEmail(email);

      res.json({
        message: 'Password reset email sent successfully',
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async updatePassword(req: Request, res: Response) {
    try {
      const { idToken, newPassword } = req.body;

      if (!idToken || !newPassword) {
        throw new ValidationError('idToken and newPassword are required');
      }

      if (newPassword.length < 6) {
        throw new ValidationError('Password must be at least 6 characters');
      }

      const result = await this.authService.updatePassword(idToken, newPassword);

      res.json({
        message: 'Password updated successfully',
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async regenerateToken(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Check if user record exists
      const existingRecord = await this.authService.getUserRecord(req.user.uid);

      if (!existingRecord) {
        // Create user record if it doesn't exist (for users who signed up before this feature)
        const name = req.body.name?.trim();
        if (!name || name.length < 2) {
          throw new ValidationError('Name is required (at least 2 characters) to generate API token');
        }

        const { apiToken } = await this.authService.createUserRecord(
          req.user.uid,
          req.user.email,
          name
        );

        return res.json({
          apiToken,
          createdAt: Date.now(),
          message: 'API token created successfully',
        });
      }

      const result = await this.authService.regenerateApiToken(req.user.uid);

      res.json({
        apiToken: result.apiToken,
        createdAt: result.createdAt,
        message: 'API token regenerated successfully',
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
