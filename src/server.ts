import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { Server as HttpServer } from 'http';
import { Server as WebSocketServer, WebSocket } from 'ws';

import { ServerConfig } from './types/config.types';
import { FirebaseService } from './services/firebase.service';
import { ProjectService } from './services/project.service';
import { EndpointService } from './services/endpoint.service';
import { ProjectController } from './controllers/project.controller';
import { EndpointController } from './controllers/endpoint.controller';
import { ProjectNotFoundError } from './types/error.types';

interface LogEntry {
  timestamp: Date;
  method: string;
  path: string;
  projectId: string;
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
  private projectController: ProjectController;
  private endpointController: EndpointController;

  // Log storage with file persistence
  private logs: LogEntry[] = [];
  private logsDir: string;
  // Map to store connected WebSocket clients by project ID
  private clients: Map<string, WebSocket[]> = new Map();

  constructor(config: ServerConfig) {
    this.config = config;
    this.logsDir = path.resolve(__dirname, '../logs');
    this.firebaseService = new FirebaseService(config.firebase);
    this.projectService = new ProjectService(this.firebaseService);
    this.endpointService = new EndpointService(this.firebaseService);
    this.projectController = new ProjectController(this.projectService);
    this.endpointController = new EndpointController(this.endpointService);

    this.ensureLogsDirectory();
    this.loadLogs();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private getLogFilePath(projectId: string): string {
    return path.join(this.logsDir, `${projectId}.json`);
  }

  private loadLogs() {
    try {
      if (!fs.existsSync(this.logsDir)) return;

      const files = fs.readdirSync(this.logsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(this.logsDir, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        const projectLogs: LogEntry[] = JSON.parse(data);
        this.logs.push(...projectLogs.map(log => ({
          ...log,
          timestamp: new Date(log.timestamp)
        })));
      }
      console.log(`Loaded ${this.logs.length} logs from disk`);
    } catch (error) {
      console.error('Error loading logs from disk:', error);
    }
  }

  private async saveLogs(projectId: string): Promise<void> {
    try {
      const projectLogs = this.logs.filter(log => log.projectId === projectId);
      const filePath = this.getLogFilePath(projectId);
      await fsPromises.writeFile(filePath, JSON.stringify(projectLogs, null, 2));
    } catch (error) {
      console.error(`Error saving logs for project ${projectId}:`, error);
    }
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
  }

  private setupRoutes() {
    // Control plane routes (projects and endpoints)
    this.app.post('/_mock-api/projects', (req, res) => this.projectController.createProject(req, res));
    this.app.get('/_mock-api/projects', (req, res) => this.projectController.listProjects(req, res));
    this.app.get('/_mock-api/projects/:projectId', (req, res) => this.projectController.getProjectById(req, res));
    this.app.patch('/_mock-api/projects/:projectId', (req, res) => this.projectController.updateProject(req, res));
    this.app.delete('/_mock-api/projects/:projectId', (req, res) => this.projectController.deleteProject(req, res));

    this.app.post('/_mock-api/projects/:projectId/endpoints', (req, res) => this.endpointController.createEndpoint(req, res));
    this.app.get('/_mock-api/projects/:projectId/endpoints', (req, res) => this.endpointController.listEndpoints(req, res));
    this.app.patch('/_mock-api/projects/:projectId/endpoints/:endpointId', (req, res) => this.endpointController.updateEndpoint(req, res));
    this.app.delete('/_mock-api/projects/:projectId/endpoints/:endpointId', (req, res) => this.endpointController.deleteEndpoint(req, res));

    // Mock endpoint handler (should be defined after control plane routes)
    this.app.all('/:projectId/*', async (req, res) => {
      const { projectId } = req.params;
      const path = req.path.replace(`/${projectId}`, '');
      const method = req.method;

      const start = Date.now();

      try {
        const endpoints = await this.endpointService.getEndpoints(projectId);
        const endpoint = endpoints.find(e => e.path === path && e.method === method);

        if (!endpoint) {
          // Capture log for 404s on mock endpoints as well
          this.captureLog({
            timestamp: new Date(),
            method,
            path: req.path,
            projectId,
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
          requestBody: req.body,
          responseStatus,
          responseBody,
        });

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
          requestBody: req.body,
          responseStatus: errorStatus,
          responseBody: { message: errorMessage },
        });

        if (error instanceof ProjectNotFoundError) {
          return res.status(404).json({ message: errorMessage });
        }
        return res.status(500).json({ message: errorMessage });
      }
    });
  }

  private setupWebSocket() {
    if (!this.httpServer) {
      console.error('HTTP server not initialized. Cannot set up WebSocket.');
      return;
    }

    console.log('Attempting to create WebSocket server...');
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws/logs' });
    console.log('WebSocket server created.');

    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('WebSocket client connected - handler started.');
      try {
        // Extract projectId from request URL, e.g., /ws/logs?projectId=YOUR_PROJECT_ID
        const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
        const projectId = urlParams.get('projectId');

        if (!projectId) {
          console.log('WebSocket connection rejected: No projectId provided');
          ws.send(JSON.stringify({ error: 'projectId is required' }));
          ws.close(1008, 'projectId required');
          return;
        }

        console.log(`WebSocket client connected for project: ${projectId}`);
        console.log('Reached point after projectId log in connection handler.');

        // Store client by project ID
        if (!this.clients.has(projectId)) {
          this.clients.set(projectId, []);
        }
        this.clients.get(projectId)?.push(ws);

        // Send a confirmation or initial data if needed
        try {
          ws.send(JSON.stringify({ message: `Connected to logs for project ${projectId}` }));
          console.log('Sent initial connection confirmation.');
        } catch (sendError) {
          console.error(`Error sending initial confirmation to client for project ${projectId}:`, sendError);
        }

        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            console.log(`Received message from client for project ${projectId}:`, data);

            // Handle WebSocket commands
            if (data.command === 'getHistory') {
              const limit = data.limit || 100;
              const projectLogs = this.logs
                .filter(log => log.projectId === projectId)
                .slice(-limit);
              ws.send(JSON.stringify({ type: 'history', logs: projectLogs }));
            } else if (data.command === 'clearLogs') {
              this.logs = this.logs.filter(log => log.projectId !== projectId);
              this.saveLogs(projectId).catch(() => {});
              ws.send(JSON.stringify({ type: 'cleared', message: 'Logs cleared' }));
            } else if (data.command === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Unknown command' }));
            }
          } catch (error) {
            console.error(`Error handling message from client for project ${projectId}:`, error);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          }
        });

        ws.on('close', () => {
          try {
            console.log(`WebSocket client disconnected for project: ${projectId}`);
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
            console.error(`Error handling WebSocket close for project ${projectId}:`, error);
          }
        });

        ws.on('error', (error) => {
          try {
            console.error(`WebSocket error for project ${projectId}:`, error);
          } catch (err) {
            console.error(`Error logging WebSocket error for project ${projectId}:`, err);
          }
        });
      } catch (error) {
        console.error('Error handling initial WebSocket connection setup:', error);
        if (ws.readyState === ws.OPEN) {
          ws.close(1011, 'Internal server error');
        }
      }
    });

    this.wss.on('listening', () => {
      console.log('WebSocket server listening');
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error during setup:', error);
    });
  }

  private setupErrorHandling() {
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Optionally, take action like shutting down the server gracefully
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      // Optionally, take action like shutting down the server gracefully
      process.exit(1); // Exit the process after logging uncaught exception
    });
  }

  private captureLog(logEntry: LogEntry): void {
    console.log('Captured log:', logEntry);
    this.logs.push(logEntry);

    // Persist logs to disk (fire and forget - errors logged internally)
    this.saveLogs(logEntry.projectId).catch(() => {});

    // Broadcast log to relevant clients
    const projectClients = this.clients.get(logEntry.projectId);
    if (projectClients) {
      projectClients.forEach(client => {
        try {
          let logMessage = '';
          try {
            logMessage = JSON.stringify({ type: 'log', ...logEntry });
          } catch (jsonError) {
            console.error(`Error stringifying log entry for project ${logEntry.projectId}:`, jsonError, logEntry);
            if (client.readyState === client.OPEN) {
              client.send(JSON.stringify({ type: 'error', message: 'Could not serialize log entry' }));
            }
            return;
          }
          if (client.readyState === client.OPEN) {
            client.send(logMessage);
          }
        } catch (error) {
          console.error(`Error sending log to WebSocket client for project ${logEntry.projectId}:`, error);
        }
      });
    }

    // Cleanup old logs per project (keep last 1000 per project)
    const projectLogs = this.logs.filter(log => log.projectId === logEntry.projectId);
    if (projectLogs.length > 1000) {
      const logsToRemove = projectLogs.slice(0, projectLogs.length - 1000);
      this.logs = this.logs.filter(log => !logsToRemove.includes(log));
      this.saveLogs(logEntry.projectId).catch(() => {});
    }
  }

  public async start() {
    return new Promise<void>((resolve) => {
      this.httpServer = this.app.listen(this.config.port, () => {
        console.log(`HTTP server is running on port ${this.config.port}`);
        this.setupWebSocket(); // Setup WebSocket after HTTP server starts
        resolve();
      });
    });
  }

  public stop() {
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.log('HTTP server closed');
      });
    }
    if (this.wss) {
      this.wss.close(() => {
        console.log('WebSocket server closed');
      });
    }
  }
} 