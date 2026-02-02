import { Request, Response } from 'express';
import { EndpointService } from '../services/endpoint.service';
import { CreateEndpointRequest, UpdateEndpointRequest, HttpMethod } from '../types/endpoint.types';
import { ValidationError } from '../types/error.types';
import logger from '../utils/logger';

const VALID_HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const VALID_PATH_REGEX = /^\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]*$/;

export class EndpointController {
  private endpointService: EndpointService;

  constructor(endpointService: EndpointService) {
    this.endpointService = endpointService;
  }

  private validatePath(path: string): void {
    if (typeof path !== 'string') {
      throw new ValidationError('Path must be a string');
    }

    const trimmedPath = path.trim();

    if (!trimmedPath) {
      throw new ValidationError('Path cannot be empty');
    }

    if (!trimmedPath.startsWith('/')) {
      throw new ValidationError(`Path must start with "/". Received: "${path}". Example: "/users" or "/api/items"`);
    }

    if (trimmedPath !== '/' && trimmedPath.endsWith('/')) {
      throw new ValidationError(`Path should not end with "/" (unless it's the root path). Received: "${path}". Did you mean "${trimmedPath.slice(0, -1)}"?`);
    }

    if (trimmedPath.includes('//')) {
      throw new ValidationError(`Path should not contain double slashes "//". Received: "${path}"`);
    }

    if (/\s/.test(trimmedPath)) {
      throw new ValidationError(`Path should not contain spaces. Received: "${path}". Use URL encoding (%20) or hyphens instead`);
    }

    if (!VALID_PATH_REGEX.test(trimmedPath)) {
      throw new ValidationError(`Path contains invalid characters. Received: "${path}". Use only alphanumeric characters, hyphens, underscores, and standard URL characters`);
    }
  }

  private validateMethod(method: string): void {
    if (typeof method !== 'string') {
      throw new ValidationError('Method must be a string');
    }

    const upperMethod = method.toUpperCase();
    if (!VALID_HTTP_METHODS.includes(upperMethod as HttpMethod)) {
      throw new ValidationError(`Invalid HTTP method: "${method}". Must be one of: ${VALID_HTTP_METHODS.join(', ')}`);
    }
  }

  private validateResponse(response: any): void {
    if (typeof response !== 'object' || response === null) {
      throw new ValidationError(
        `Response must be an object, received ${typeof response}. Example: { "status": 200, "body": { "message": "Hello" } }`
      );
    }

    if (Array.isArray(response)) {
      throw new ValidationError(
        'Response must be an object, not an array. Example: { "status": 200, "body": { "message": "Hello" } }'
      );
    }

    if (response.status === undefined || response.status === null) {
      throw new ValidationError(
        'Response must include a "status" field. Example: { "status": 200, "body": { "message": "Hello" } }'
      );
    }

    if (typeof response.status !== 'number' || !Number.isInteger(response.status)) {
      throw new ValidationError(
        `Response status must be an integer, received ${typeof response.status}. Example: 200, 201, 404, 500`
      );
    }

    if (response.status < 100 || response.status > 599) {
      throw new ValidationError(
        `Response status must be between 100 and 599, received ${response.status}`
      );
    }

    if (response.body === undefined) {
      throw new ValidationError(
        'Response must include a "body" field. Example: { "status": 200, "body": { "message": "Hello" } }'
      );
    }
  }

  private validateDelay(delay: any): void {
    if (delay === undefined || delay === null) {
      return; // delay is optional
    }

    if (typeof delay !== 'number' || !Number.isInteger(delay)) {
      throw new ValidationError(`Delay must be an integer (milliseconds), received ${typeof delay}`);
    }

    if (delay < 0) {
      throw new ValidationError(`Delay cannot be negative, received ${delay}`);
    }

    if (delay > 30000) {
      throw new ValidationError(`Delay cannot exceed 30 seconds (30000ms), received ${delay}`);
    }
  }

  async createEndpoint(req: Request, res: Response) {
    const { projectId } = req.params;
    const endpointData = req.body as CreateEndpointRequest;
    const userId = req.user?.uid;

    try {
      // Validate required fields exist
      if (!endpointData.path && endpointData.path !== '') {
        throw new ValidationError('Missing required field: path');
      }
      if (!endpointData.method) {
        throw new ValidationError('Missing required field: method');
      }
      if (!endpointData.response) {
        throw new ValidationError('Missing required field: response');
      }

      // Validate each field
      this.validatePath(endpointData.path);
      this.validateMethod(endpointData.method);
      this.validateResponse(endpointData.response);
      this.validateDelay(endpointData.delay);

      // Normalize the data
      endpointData.path = endpointData.path.trim();
      endpointData.method = endpointData.method.toUpperCase() as HttpMethod;
      endpointData.projectId = projectId;

      const endpoint = await this.endpointService.createEndpoint(endpointData, userId);
      logger.info('Endpoint created via API', { endpointId: endpoint.id, projectId, path: endpoint.path, method: endpoint.method });
      res.status(201).json(endpoint);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async listEndpoints(req: Request, res: Response) {
    const { projectId } = req.params;
    const userId = req.user?.uid;

    try {
      const endpoints = await this.endpointService.getEndpoints(projectId, userId);
      res.json(endpoints);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async updateEndpoint(req: Request, res: Response) {
    const { projectId, endpointId } = req.params;
    const updates = req.body as UpdateEndpointRequest;
    const userId = req.user?.uid;

    try {
      // Validate fields if provided
      if (updates.path !== undefined) {
        this.validatePath(updates.path);
        updates.path = updates.path.trim();
      }

      if (updates.method !== undefined) {
        this.validateMethod(updates.method);
        updates.method = updates.method.toUpperCase() as HttpMethod;
      }

      if (updates.response !== undefined) {
        this.validateResponse(updates.response);
      }

      if (updates.delay !== undefined) {
        this.validateDelay(updates.delay);
      }

      const endpoint = await this.endpointService.updateEndpoint(projectId, endpointId, updates, userId);
      res.json(endpoint);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async deleteEndpoint(req: Request, res: Response) {
    const { projectId, endpointId } = req.params;
    const userId = req.user?.uid;

    try {
      await this.endpointService.deleteEndpoint(projectId, endpointId, userId);
      res.json({ message: 'Endpoint deleted successfully' });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  private handleError(error: any, res: Response) {
    logger.error('Endpoint controller error', { error: error.message });

    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error.name === 'ProjectNotFoundError' || error.name === 'EndpointNotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    if (error.name === 'EndpointAlreadyExistsError' || error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}
