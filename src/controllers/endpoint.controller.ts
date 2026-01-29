import { Request, Response } from 'express';
import { EndpointService } from '../services/endpoint.service';
import { CreateEndpointRequest, UpdateEndpointRequest } from '../types/endpoint.types';
import { ValidationError } from '../types/error.types';

export class EndpointController {
  private endpointService: EndpointService;

  constructor(endpointService: EndpointService) {
    this.endpointService = endpointService;
  }

  async createEndpoint(req: Request, res: Response) {
    const { projectId } = req.params;
    const endpointData = req.body as CreateEndpointRequest;

    try {
      // Validate required fields
      if (!endpointData.path || !endpointData.method || !endpointData.response) {
        throw new ValidationError('Missing required fields: path, method, and response are required');
      }

      // Validate response object
      if (typeof endpointData.response !== 'object') {
        throw new ValidationError(
          `Response must be an object, received ${typeof endpointData.response}. Example: { "status": 200, "body": { "message": "Hello" } }`
        );
      }

      if (Array.isArray(endpointData.response)) {
        throw new ValidationError(
          'Response must be an object, not an array. Example: { "status": 200, "body": { "message": "Hello" } }'
        );
      }

      if (!endpointData.response.status || !endpointData.response.body) {
        throw new ValidationError(
          'Response must include status and body fields. Example: { "status": 200, "body": { "message": "Hello" } }'
        );
      }

      // Set the projectId from the URL parameter
      endpointData.projectId = projectId;

      const endpoint = await this.endpointService.createEndpoint(endpointData);
      res.status(201).json(endpoint);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async listEndpoints(req: Request, res: Response) {
    const { projectId } = req.params;

    try {
      const endpoints = await this.endpointService.getEndpoints(projectId);
      res.json(endpoints);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async updateEndpoint(req: Request, res: Response) {
    const { projectId, endpointId } = req.params;
    const updates = req.body as UpdateEndpointRequest;

    try {
      const endpoint = await this.endpointService.updateEndpoint(projectId, endpointId, updates);
      res.json(endpoint);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async deleteEndpoint(req: Request, res: Response) {
    const { projectId, endpointId } = req.params;

    try {
      await this.endpointService.deleteEndpoint(projectId, endpointId);
      res.json({ message: 'Endpoint deleted successfully' });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  private handleError(error: any, res: Response) {
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