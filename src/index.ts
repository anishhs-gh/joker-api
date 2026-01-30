import 'dotenv/config';
import path from 'path';
import { MockApiServer } from './server';
import { ServerConfig, FirebaseConfig } from './types/config.types';
import logger from './utils/logger';

// Build Firebase config with flexible credential loading
function buildFirebaseConfig(): FirebaseConfig {
  const projectId = process.env.FIREBASE_PROJECT_ID || '';

  // Priority 1: Service account credentials as JSON string from env var
  if (process.env.FIREBASE_SERVICE_ACCOUNT_CREDENTIALS) {
    try {
      const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_CREDENTIALS);
      return { projectId, serviceAccountCredentials: credentials };
    } catch (error) {
      logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_CREDENTIALS', { error: (error as Error).message });
    }
  }

  // Priority 2: Service account key file path
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
    return {
      projectId,
      serviceAccountKeyPath: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH
    };
  }

  // Priority 3: Check for local serviceAccountKey.json file
  const localKeyPath = path.resolve(__dirname, 'serviceAccountKey.json');
  try {
    require('fs').accessSync(localKeyPath);
    return { projectId, serviceAccountKeyPath: localKeyPath };
  } catch {
    // File doesn't exist, fall through to ADC
  }

  // Priority 4: Application Default Credentials (ADC)
  // Relies on GOOGLE_APPLICATION_CREDENTIALS env var or GCP metadata
  return { projectId };
}

const config: ServerConfig = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  },
  firebase: buildFirebaseConfig(),
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY
};

const server = new MockApiServer(config);

// Graceful shutdown handling
const shutdown = () => {
  logger.info('Received shutdown signal, closing server...');
  server.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.start().catch(error => {
  logger.error('Failed to start server', { error: (error as Error).message });
  process.exit(1);
});
