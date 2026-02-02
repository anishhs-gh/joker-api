import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import logger from '../utils/logger';
import { FirebaseAuthResponse, FirebaseAuthError, AuthUser, UserRecord } from '../types/auth.types';

const FIREBASE_AUTH_API_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';
const API_TOKEN_PREFIX = 'jkr_';

export class AuthService {
  private webApiKey: string;
  private db: admin.firestore.Firestore;

  constructor(webApiKey: string) {
    this.webApiKey = webApiKey;
    this.db = admin.firestore();
  }

  generateApiToken(): { token: string; hash: string } {
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const token = `${API_TOKEN_PREFIX}${randomBytes}`;
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hash };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateAvatarColor(): string {
    const colors = [
      '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
      '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
      '#8BC34A', '#FF9800', '#FF5722', '#795548', '#607D8B',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  async createUserRecord(uid: string, email: string, name: string): Promise<{ userRecord: UserRecord; apiToken: string }> {
    const { token, hash } = this.generateApiToken();
    const now = Date.now();

    const userRecord: UserRecord = {
      uid,
      email,
      name,
      avatarColor: this.generateAvatarColor(),
      apiTokenHash: hash,
      apiTokenCreatedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.collection('users').doc(uid).set(userRecord);
    logger.info('User record created', { uid, email, name });

    return { userRecord, apiToken: token };
  }

  async getUserRecord(uid: string): Promise<UserRecord | null> {
    const doc = await this.db.collection('users').doc(uid).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as UserRecord;
  }

  async regenerateApiToken(uid: string): Promise<{ apiToken: string; createdAt: number }> {
    const { token, hash } = this.generateApiToken();
    const now = Date.now();

    await this.db.collection('users').doc(uid).update({
      apiTokenHash: hash,
      apiTokenCreatedAt: now,
      updatedAt: now,
    });

    logger.info('API token regenerated', { uid });
    return { apiToken: token, createdAt: now };
  }

  async verifyApiToken(token: string): Promise<AuthUser | null> {
    if (!token || !token.startsWith(API_TOKEN_PREFIX)) {
      return null;
    }

    const hash = this.hashToken(token);
    const snapshot = await this.db.collection('users')
      .where('apiTokenHash', '==', hash)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const userRecord = snapshot.docs[0].data() as UserRecord;
    return {
      uid: userRecord.uid,
      email: userRecord.email,
      name: userRecord.name,
    };
  }

  async signup(email: string, password: string, name: string): Promise<FirebaseAuthResponse & { apiToken: string; name: string; avatarColor: string }> {
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

    // Create user record with API token
    const { userRecord, apiToken } = await this.createUserRecord(data.localId, email, name);

    logger.info('User signed up successfully', { email, uid: data.localId, name });
    return { ...data as FirebaseAuthResponse, apiToken, name, avatarColor: userRecord.avatarColor };
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
