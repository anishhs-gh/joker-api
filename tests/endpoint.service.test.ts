import { EndpointService } from '../src/services/endpoint.service';
import { FirebaseService } from '../src/services/firebase.service';
import { ProjectNotFoundError, EndpointNotFoundError, EndpointAlreadyExistsError } from '../src/types/error.types';
import { MockEndpoint, Project } from '../src/types';

// Mock the FirebaseService
jest.mock('../src/services/firebase.service');

describe('EndpointService', () => {
  let endpointService: EndpointService;
  let mockFirebaseService: jest.Mocked<FirebaseService>;

  const mockProject: Project = {
    id: 'project-123',
    name: 'Test Project',
    nameLower: 'test project',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const mockEndpoint: MockEndpoint = {
    id: 'endpoint-123',
    projectId: 'project-123',
    path: '/users',
    method: 'GET',
    response: { status: 200, body: { users: [] } },
    delay: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirebaseService = new FirebaseService({} as any) as jest.Mocked<FirebaseService>;
    endpointService = new EndpointService(mockFirebaseService);
  });

  describe('createEndpoint', () => {
    it('should create a new endpoint when project exists and endpoint is unique', async () => {
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getEndpoints.mockResolvedValue([]);
      mockFirebaseService.createEndpoint.mockResolvedValue(mockEndpoint);

      const result = await endpointService.createEndpoint({
        projectId: 'project-123',
        path: '/users',
        method: 'GET',
        response: { status: 200, body: { users: [] } }
      });

      expect(result).toEqual(mockEndpoint);
    });

    it('should throw ProjectNotFoundError when project does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(null);

      await expect(endpointService.createEndpoint({
        projectId: 'nonexistent',
        path: '/users',
        method: 'GET',
        response: { status: 200, body: {} }
      })).rejects.toThrow(ProjectNotFoundError);
    });

    it('should throw EndpointAlreadyExistsError when endpoint path/method already exists', async () => {
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getEndpoints.mockResolvedValue([mockEndpoint]);

      await expect(endpointService.createEndpoint({
        projectId: 'project-123',
        path: '/users',
        method: 'GET',
        response: { status: 200, body: {} }
      })).rejects.toThrow(EndpointAlreadyExistsError);
    });
  });

  describe('getEndpoints', () => {
    it('should return endpoints when project exists', async () => {
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getEndpoints.mockResolvedValue([mockEndpoint]);

      const result = await endpointService.getEndpoints('project-123');

      expect(result).toEqual([mockEndpoint]);
    });

    it('should throw ProjectNotFoundError when project does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(null);

      await expect(endpointService.getEndpoints('nonexistent'))
        .rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('updateEndpoint', () => {
    it('should update endpoint when it exists', async () => {
      const updatedEndpoint = { ...mockEndpoint, path: '/updated-users' };
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getEndpoints.mockResolvedValue([mockEndpoint]);
      mockFirebaseService.updateEndpoint.mockResolvedValue(updatedEndpoint);

      const result = await endpointService.updateEndpoint(
        'project-123',
        'endpoint-123',
        { path: '/updated-users' }
      );

      expect(result).toEqual(updatedEndpoint);
    });

    it('should throw ProjectNotFoundError when project does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(null);

      await expect(endpointService.updateEndpoint(
        'nonexistent',
        'endpoint-123',
        { path: '/new-path' }
      )).rejects.toThrow(ProjectNotFoundError);
    });

    it('should throw EndpointNotFoundError when endpoint does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getEndpoints.mockResolvedValue([]);

      await expect(endpointService.updateEndpoint(
        'project-123',
        'nonexistent',
        { path: '/new-path' }
      )).rejects.toThrow(EndpointNotFoundError);
    });

    it('should throw EndpointAlreadyExistsError when updating to conflicting path/method', async () => {
      const anotherEndpoint = { ...mockEndpoint, id: 'endpoint-456', path: '/other' };
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getEndpoints.mockResolvedValue([mockEndpoint, anotherEndpoint]);

      await expect(endpointService.updateEndpoint(
        'project-123',
        'endpoint-456',
        { path: '/users', method: 'GET' }
      )).rejects.toThrow(EndpointAlreadyExistsError);
    });
  });

  describe('deleteEndpoint', () => {
    it('should delete endpoint when it exists', async () => {
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getEndpoints.mockResolvedValue([mockEndpoint]);
      mockFirebaseService.deleteEndpoint.mockResolvedValue(undefined);

      await endpointService.deleteEndpoint('project-123', 'endpoint-123');

      expect(mockFirebaseService.deleteEndpoint).toHaveBeenCalledWith('project-123', 'endpoint-123');
    });

    it('should throw ProjectNotFoundError when project does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(null);

      await expect(endpointService.deleteEndpoint('nonexistent', 'endpoint-123'))
        .rejects.toThrow(ProjectNotFoundError);
    });

    it('should throw EndpointNotFoundError when endpoint does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getEndpoints.mockResolvedValue([]);

      await expect(endpointService.deleteEndpoint('project-123', 'nonexistent'))
        .rejects.toThrow(EndpointNotFoundError);
    });
  });
});
