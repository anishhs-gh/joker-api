import { MockEndpoint, CreateEndpointRequest } from '../types';
import { UpdateEndpointRequest } from '../types/endpoint.types';
import { ProjectNotFoundError, EndpointNotFoundError, EndpointAlreadyExistsError } from '../types/error.types';
import { FirebaseService } from './firebase.service';

export class EndpointService {
  private firebaseService: FirebaseService;

  constructor(firebaseService: FirebaseService) {
    this.firebaseService = firebaseService;
  }

  async createEndpoint(data: CreateEndpointRequest, userId?: string): Promise<MockEndpoint> {
    const project = await this.firebaseService.getProject(data.projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(data.projectId);
    }

    const existingEndpoints = await this.firebaseService.getEndpoints(data.projectId, userId);
    const existingEndpoint = existingEndpoints.find(
      (e: MockEndpoint) => e.path === data.path && e.method === data.method
    );

    if (existingEndpoint) {
      throw new EndpointAlreadyExistsError(data.path, data.method);
    }

    return this.firebaseService.createEndpoint(data, userId);
  }

  async getEndpoints(projectId: string, userId?: string): Promise<MockEndpoint[]> {
    const project = await this.firebaseService.getProject(projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    return this.firebaseService.getEndpoints(project.nameLower, userId);
  }

  async updateEndpoint(projectId: string, endpointId: string, updates: UpdateEndpointRequest, userId?: string): Promise<MockEndpoint> {
    const project = await this.firebaseService.getProject(projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    const endpoints = await this.firebaseService.getEndpoints(projectId, userId);
    const endpoint = endpoints.find((e: MockEndpoint) => e.id === endpointId);
    if (!endpoint) {
      throw new EndpointNotFoundError(endpointId);
    }

    if (updates.path || updates.method) {
      const newPath = updates.path || endpoint.path;
      const newMethod = updates.method || endpoint.method;
      const conflictingEndpoint = endpoints.find(
        (e: MockEndpoint) => e.id !== endpointId && e.path === newPath && e.method === newMethod
      );

      if (conflictingEndpoint) {
        throw new EndpointAlreadyExistsError(newPath, newMethod);
      }
    }

    return this.firebaseService.updateEndpoint(projectId, endpointId, updates, userId);
  }

  async deleteEndpoint(projectId: string, endpointId: string, userId?: string): Promise<void> {
    const project = await this.firebaseService.getProject(projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    const endpoints = await this.firebaseService.getEndpoints(projectId, userId);
    const endpoint = endpoints.find((e: MockEndpoint) => e.id === endpointId);
    if (!endpoint) {
      throw new EndpointNotFoundError(endpointId);
    }

    await this.firebaseService.deleteEndpoint(projectId, endpointId, userId);
  }
}
