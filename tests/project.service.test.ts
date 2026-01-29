import { ProjectService } from '../src/services/project.service';
import { FirebaseService } from '../src/services/firebase.service';
import { ProjectNotFoundError, ProjectAlreadyExistsError } from '../src/types/error.types';
import { Project } from '../src/types';

// Mock the FirebaseService
jest.mock('../src/services/firebase.service');

describe('ProjectService', () => {
  let projectService: ProjectService;
  let mockFirebaseService: jest.Mocked<FirebaseService>;

  const mockProject: Project = {
    id: 'project-123',
    name: 'Test Project',
    nameLower: 'test project',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirebaseService = new FirebaseService({} as any) as jest.Mocked<FirebaseService>;
    projectService = new ProjectService(mockFirebaseService);
  });

  describe('createProject', () => {
    it('should create a new project when name does not exist', async () => {
      mockFirebaseService.getProjectByName.mockResolvedValue(null);
      mockFirebaseService.createProject.mockResolvedValue(mockProject);

      const result = await projectService.createProject('Test Project');

      expect(mockFirebaseService.getProjectByName).toHaveBeenCalledWith('test project');
      expect(mockFirebaseService.createProject).toHaveBeenCalledWith('Test Project');
      expect(result).toEqual(mockProject);
    });

    it('should throw ProjectAlreadyExistsError when project name exists', async () => {
      mockFirebaseService.getProjectByName.mockResolvedValue(mockProject);

      await expect(projectService.createProject('Test Project'))
        .rejects.toThrow(ProjectAlreadyExistsError);
      expect(mockFirebaseService.createProject).not.toHaveBeenCalled();
    });
  });

  describe('getProjectById', () => {
    it('should return project when found', async () => {
      mockFirebaseService.getProject.mockResolvedValue(mockProject);

      const result = await projectService.getProjectById('project-123');

      expect(mockFirebaseService.getProject).toHaveBeenCalledWith('project-123');
      expect(result).toEqual(mockProject);
    });

    it('should throw ProjectNotFoundError when project does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(null);

      await expect(projectService.getProjectById('nonexistent'))
        .rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('listProjects', () => {
    it('should return all projects', async () => {
      const projects = [mockProject, { ...mockProject, id: 'project-456' }];
      mockFirebaseService.listProjects.mockResolvedValue(projects);

      const result = await projectService.listProjects();

      expect(mockFirebaseService.listProjects).toHaveBeenCalled();
      expect(result).toEqual(projects);
    });
  });

  describe('updateProject', () => {
    it('should update project when it exists', async () => {
      const updatedProject = { ...mockProject, name: 'Updated Project' };
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getProjectByName.mockResolvedValue(null);
      mockFirebaseService.updateProject.mockResolvedValue(updatedProject);

      const result = await projectService.updateProject('project-123', { name: 'Updated Project' });

      expect(result).toEqual(updatedProject);
    });

    it('should throw ProjectNotFoundError when project does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(null);

      await expect(projectService.updateProject('nonexistent', { name: 'New Name' }))
        .rejects.toThrow(ProjectNotFoundError);
    });

    it('should throw ProjectAlreadyExistsError when updating to existing name', async () => {
      const otherProject = { ...mockProject, id: 'other-project' };
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.getProjectByName.mockResolvedValue(otherProject);

      await expect(projectService.updateProject('project-123', { name: 'Other Name' }))
        .rejects.toThrow(ProjectAlreadyExistsError);
    });
  });

  describe('deleteProject', () => {
    it('should delete project when it exists', async () => {
      mockFirebaseService.getProject.mockResolvedValue(mockProject);
      mockFirebaseService.deleteProject.mockResolvedValue(undefined);

      await projectService.deleteProject('project-123');

      expect(mockFirebaseService.deleteProject).toHaveBeenCalledWith('project-123');
    });

    it('should throw ProjectNotFoundError when project does not exist', async () => {
      mockFirebaseService.getProject.mockResolvedValue(null);

      await expect(projectService.deleteProject('nonexistent'))
        .rejects.toThrow(ProjectNotFoundError);
    });
  });
});
