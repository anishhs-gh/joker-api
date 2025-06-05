import { MockApiServer } from './server';
import { ServerConfig } from './types/config.types';

const config: ServerConfig = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    serviceAccountKeyPath: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || '../serviceAccountKey.json'
  }
};

const server = new MockApiServer(config);

server.start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
}); 