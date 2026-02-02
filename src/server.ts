import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as HttpServer } from 'http';
import { Server as WebSocketServer, WebSocket } from 'ws';

import { ServerConfig } from './types/config.types';
import { FirebaseService } from './services/firebase.service';
import { ProjectService } from './services/project.service';
import { EndpointService } from './services/endpoint.service';
import { AuthService } from './services/auth.service';
import { ProjectController } from './controllers/project.controller';
import { EndpointController } from './controllers/endpoint.controller';
import { AuthController } from './controllers/auth.controller';
import { createAuthMiddleware, requireAuth, requireFullAuth } from './middleware/auth.middleware';
import { ProjectNotFoundError } from './types/error.types';
import logger from './utils/logger';

interface LogEntry {
  timestamp: Date;
  method: string;
  path: string;
  projectId: string;
  requestHeaders: Record<string, string>;
  requestBody: any;
  responseStatus: number;
  responseBody: any;
}

export class MockApiServer {
  private app = express();
  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private config: ServerConfig;
  private firebaseService: FirebaseService;
  private projectService: ProjectService;
  private endpointService: EndpointService;
  private authService: AuthService | null = null;
  private projectController: ProjectController;
  private endpointController: EndpointController;
  private authController: AuthController | null = null;

  // Map to store connected WebSocket clients by project ID
  private clients: Map<string, WebSocket[]> = new Map();

  constructor(config: ServerConfig) {
    this.config = config;
    this.firebaseService = new FirebaseService(config.firebase);
    this.projectService = new ProjectService(this.firebaseService);
    this.endpointService = new EndpointService(this.firebaseService);
    this.projectController = new ProjectController(this.projectService);
    this.endpointController = new EndpointController(this.endpointService);

    // Initialize auth service if Firebase Web API key is provided
    if (config.firebaseWebApiKey) {
      this.authService = new AuthService(config.firebaseWebApiKey);
      this.authController = new AuthController(this.authService);
      logger.info('Firebase Auth enabled');
    } else {
      logger.info('Firebase Auth disabled (FIREBASE_WEB_API_KEY not set)');
    }

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware() {
    // Security headers
    this.app.use(helmet());

    // Rate limiting - 100 requests per 15 minutes per IP
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' }
    });
    this.app.use(limiter);

    if (this.config.cors) {
      this.app.use(cors());
    }
    this.app.use(express.json());

    // Auth middleware - attaches req.user if token is valid
    this.app.use(createAuthMiddleware(this.authService));
  }

  private setupRoutes() {
    // Auth routes (only if auth is configured)
    if (this.authController) {
      this.app.post('/_mock-api/auth/signup', (req, res) => this.authController!.signup(req, res));
      this.app.post('/_mock-api/auth/login', (req, res) => this.authController!.login(req, res));
      this.app.get('/_mock-api/auth/me', requireAuth, (req, res) => this.authController!.getCurrentUser(req, res));
      this.app.post('/_mock-api/auth/verify-email/resend', (req, res) => this.authController!.resendVerificationEmail(req, res));
      this.app.post('/_mock-api/auth/password/reset', (req, res) => this.authController!.resetPassword(req, res));
      this.app.post('/_mock-api/auth/password/update', (req, res) => this.authController!.updatePassword(req, res));
      this.app.post('/_mock-api/auth/token/regenerate', requireFullAuth, (req, res) => this.authController!.regenerateToken(req, res));
      logger.info('Auth routes registered at /_mock-api/auth/*');
    }

    // Control plane routes (projects and endpoints) - require full Firebase auth, not API keys
    this.app.post('/_mock-api/projects', requireFullAuth, (req, res) => this.projectController.createProject(req, res));
    this.app.get('/_mock-api/projects', requireFullAuth, (req, res) => this.projectController.listProjects(req, res));
    this.app.get('/_mock-api/projects/:projectId', requireFullAuth, (req, res) => this.projectController.getProjectById(req, res));
    this.app.patch('/_mock-api/projects/:projectId', requireFullAuth, (req, res) => this.projectController.updateProject(req, res));
    this.app.delete('/_mock-api/projects/:projectId', requireFullAuth, (req, res) => this.projectController.deleteProject(req, res));

    this.app.post('/_mock-api/projects/:projectId/endpoints', requireFullAuth, (req, res) => this.endpointController.createEndpoint(req, res));
    this.app.get('/_mock-api/projects/:projectId/endpoints', requireFullAuth, (req, res) => this.endpointController.listEndpoints(req, res));
    this.app.patch('/_mock-api/projects/:projectId/endpoints/:endpointId', requireFullAuth, (req, res) => this.endpointController.updateEndpoint(req, res));
    this.app.delete('/_mock-api/projects/:projectId/endpoints/:endpointId', requireFullAuth, (req, res) => this.endpointController.deleteEndpoint(req, res));

    // Mock endpoint handler (should be defined after control plane routes)
    this.app.all('/:projectId/*', async (req, res) => {
      const { projectId } = req.params;
      const reqPath = req.path.replace(`/${projectId}`, '');
      const method = req.method;

      // Capture request headers (sanitize sensitive ones)
      const requestHeaders = this.sanitizeHeaders(req.headers as Record<string, string>);

      try {
        const userId = req.user?.uid;
        const endpoints = await this.endpointService.getEndpoints(projectId, userId);
        const endpoint = endpoints.find(e => e.path === reqPath && e.method === method);

        if (!endpoint) {
          // Capture log for 404s on mock endpoints as well
          this.captureLog({
            timestamp: new Date(),
            method,
            path: req.path,
            projectId,
            requestHeaders,
            requestBody: req.body,
            responseStatus: 404,
            responseBody: { error: 'Endpoint not found' },
          });
          return res.status(404).json({ error: 'Endpoint not found' });
        }

        if (endpoint.delay) {
          await new Promise(resolve => setTimeout(resolve, endpoint.delay));
        }

        const responseBody = endpoint.response?.body || {};
        const responseStatus = endpoint.response?.status || 200;

        // Capture successful request log
        this.captureLog({
          timestamp: new Date(),
          method,
          path: req.path,
          projectId,
          requestHeaders,
          requestBody: req.body,
          responseStatus,
          responseBody,
        });

        logger.debug('Mock endpoint request', { method, path: reqPath, projectId, responseStatus });
        res.status(responseStatus).json(responseBody);
      } catch (error) {
        const errorStatus = error instanceof ProjectNotFoundError ? 404 : 500;
        const errorMessage = (error as Error).message || 'Internal server error';

        // Capture error log
        this.captureLog({
          timestamp: new Date(),
          method,
          path: req.path,
          projectId,
          requestHeaders,
          requestBody: req.body,
          responseStatus: errorStatus,
          responseBody: { message: errorMessage },
        });

        logger.error('Mock endpoint error', { method, path: reqPath, projectId, error: errorMessage });

        if (error instanceof ProjectNotFoundError) {
          return res.status(404).json({ message: errorMessage });
        }
        return res.status(500).json({ message: errorMessage });
      }
    });
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    // Remove sensitive headers
    delete sanitized['authorization'];
    delete sanitized['cookie'];
    delete sanitized['set-cookie'];
    delete sanitized['x-api-key'];
    return sanitized;
  }

  private setupWebSocket() {
    if (!this.httpServer) {
      logger.error('HTTP server not initialized. Cannot set up WebSocket.');
      return;
    }

    logger.debug('Creating WebSocket server...');
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws/logs' });
    logger.debug('WebSocket server created');

    this.wss.on('connection', (ws: WebSocket, req) => {
      logger.debug('WebSocket client connection initiated');
      try {
        // Extract projectId from request URL, e.g., /ws/logs?projectId=YOUR_PROJECT_ID
        const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
        const projectId = urlParams.get('projectId');

        if (!projectId) {
          logger.warn('WebSocket connection rejected: No projectId provided');
          ws.send(JSON.stringify({ error: 'projectId is required' }));
          ws.close(1008, 'projectId required');
          return;
        }

        logger.info('WebSocket client connected', { projectId });

        // Store client by project ID
        if (!this.clients.has(projectId)) {
          this.clients.set(projectId, []);
        }
        this.clients.get(projectId)?.push(ws);

        // Send a confirmation or initial data if needed
        try {
          ws.send(JSON.stringify({ message: `Connected to logs for project ${projectId}` }));
        } catch (sendError) {
          logger.error('Error sending initial confirmation to WebSocket client', { projectId, error: (sendError as Error).message });
        }

        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            logger.debug('WebSocket message received', { projectId, command: data.command });

            // Handle WebSocket commands
            if (data.command === 'getHistory') {
              const limit = data.limit || 100;
              this.firebaseService.getLogs(projectId, limit)
                .then(logs => ws.send(JSON.stringify({ type: 'history', logs })))
                .catch(err => {
                  logger.error('Error fetching logs', { projectId, error: err.message });
                  ws.send(JSON.stringify({ type: 'error', message: 'Failed to fetch logs' }));
                });
            } else if (data.command === 'clearLogs') {
              this.firebaseService.clearLogs(projectId)
                .then(count => ws.send(JSON.stringify({ type: 'cleared', message: `${count} logs cleared` })))
                .catch(err => {
                  logger.error('Error clearing logs', { projectId, error: err.message });
                  ws.send(JSON.stringify({ type: 'error', message: 'Failed to clear logs' }));
                });
            } else if (data.command === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Unknown command' }));
            }
          } catch (error) {
            logger.error('Error handling WebSocket message', { projectId, error: (error as Error).message });
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          }
        });

        ws.on('close', () => {
          try {
            logger.info('WebSocket client disconnected', { projectId });
            // Remove client from the map
            const projectClients = this.clients.get(projectId);
            if (projectClients) {
              const index = projectClients.indexOf(ws);
              if (index > -1) {
                projectClients.splice(index, 1);
              }
              if (projectClients.length === 0) {
                this.clients.delete(projectId);
              }
            }
          } catch (error) {
            logger.error('Error handling WebSocket close', { projectId, error: (error as Error).message });
          }
        });

        ws.on('error', (error) => {
          logger.error('WebSocket error', { projectId, error: error.message });
        });
      } catch (error) {
        logger.error('Error in WebSocket connection setup', { error: (error as Error).message });
        if (ws.readyState === ws.OPEN) {
          ws.close(1011, 'Internal server error');
        }
      }
    });

    this.wss.on('listening', () => {
      logger.info('WebSocket server listening');
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  private setupErrorHandling() {
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason: String(reason) });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });
  }

  private captureLog(logEntry: LogEntry): void {
    logger.debug('Log captured', { method: logEntry.method, path: logEntry.path, projectId: logEntry.projectId, status: logEntry.responseStatus });

    // Persist log to Firestore (fire and forget)
    this.firebaseService.saveLog(logEntry).catch(err => {
      logger.error('Error saving log to Firestore', { projectId: logEntry.projectId, error: err.message });
    });

    // Broadcast log to relevant WebSocket clients
    const projectClients = this.clients.get(logEntry.projectId);
    if (projectClients) {
      const logMessage = JSON.stringify({ type: 'log', ...logEntry });
      projectClients.forEach(client => {
        try {
          if (client.readyState === client.OPEN) {
            client.send(logMessage);
          }
        } catch (error) {
          logger.error('Error sending log to WebSocket client', { projectId: logEntry.projectId, error: (error as Error).message });
        }
      });
    }
  }

  public async start() {
    return new Promise<void>((resolve) => {
      this.httpServer = this.app.listen(this.config.port, () => {
        logger.info('HTTP server started', { port: this.config.port });
        this.setupWebSocket(); // Setup WebSocket after HTTP server starts
        resolve();
      });
    });
  }

  public stop() {
    if (this.httpServer) {
      this.httpServer.close(() => {
        logger.info('HTTP server closed');
      });
    }
    if (this.wss) {
      this.wss.close(() => {
        logger.info('WebSocket server closed');
      });
    }
  }
}
