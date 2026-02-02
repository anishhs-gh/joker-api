export type AuthType = 'firebase' | 'apikey';

export interface AuthUser {
  uid: string;
  email: string;
  name?: string;
}

export interface UserRecord {
  uid: string;
  email: string;
  name: string;
  avatarColor: string;
  apiTokenHash: string;
  apiTokenCreatedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface FirebaseAuthResponse {
  idToken: string;
  email: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
}

export interface FirebaseAuthError {
  error: {
    code: number;
    message: string;
    errors: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser | null;
      authType?: AuthType;
    }
  }
}
