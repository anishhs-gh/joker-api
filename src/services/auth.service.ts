import * as admin from 'firebase-admin';
import logger from '../utils/logger';
import { FirebaseAuthResponse, FirebaseAuthError, AuthUser } from '../types/auth.types';

const FIREBASE_AUTH_API_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';

export class AuthService {
  private webApiKey: string;

  constructor(webApiKey: string) {
    this.webApiKey = webApiKey;
  }

  async signup(email: string, password: string): Promise<FirebaseAuthResponse> {
    const url = `${FIREBASE_AUTH_API_URL}:signUp?key=${this.webApiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as FirebaseAuthError;
      logger.error('Firebase signup error', { email, error: error.error.message });
      throw new Error(this.mapFirebaseError(error.error.message));
    }

    logger.info('User signed up successfully', { email, uid: data.localId });
    return data as FirebaseAuthResponse;
  }

  async login(email: string, password: string): Promise<FirebaseAuthResponse> {
    const url = `${FIREBASE_AUTH_API_URL}:signInWithPassword?key=${this.webApiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as FirebaseAuthError;
      logger.error('Firebase login error', { email, error: error.error.message });
      throw new Error(this.mapFirebaseError(error.error.message));
    }

    logger.info('User logged in successfully', { email, uid: data.localId });
    return data as FirebaseAuthResponse;
  }

  async verifyIdToken(idToken: string): Promise<AuthUser | null> {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return {
        uid: decodedToken.uid,
        email: decodedToken.email || '',
      };
    } catch (error) {
      logger.debug('Token verification failed', { error: (error as Error).message });
      return null;
    }
  }

  async getUserById(uid: string): Promise<AuthUser | null> {
    try {
      const userRecord = await admin.auth().getUser(uid);
      return {
        uid: userRecord.uid,
        email: userRecord.email || '',
      };
    } catch (error) {
      logger.error('Failed to get user by ID', { uid, error: (error as Error).message });
      return null;
    }
  }

  private mapFirebaseError(errorCode: string): string {
    const errorMap: Record<string, string> = {
      'EMAIL_EXISTS': 'An account with this email already exists',
      'INVALID_EMAIL': 'Invalid email address',
      'WEAK_PASSWORD : Password should be at least 6 characters': 'Password must be at least 6 characters',
      'EMAIL_NOT_FOUND': 'Invalid email or password',
      'INVALID_PASSWORD': 'Invalid email or password',
      'INVALID_LOGIN_CREDENTIALS': 'Invalid email or password',
      'USER_DISABLED': 'This account has been disabled',
      'TOO_MANY_ATTEMPTS_TRY_LATER': 'Too many failed attempts. Please try again later',
    };

    return errorMap[errorCode] || `Authentication error: ${errorCode}`;
  }
}
