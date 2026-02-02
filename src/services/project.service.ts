import { Project } from '../types';
import { UpdateProjectRequest } from '../types/project.types';
import { ProjectNotFoundError, ProjectAlreadyExistsError } from '../types/error.types';
import { FirebaseService } from './firebase.service';

export class ProjectService {
  private firebaseService: FirebaseService;

  constructor(firebaseService: FirebaseService) {
    this.firebaseService = firebaseService;
  }

  async createProject(name: string, userId?: string): Promise<Project> {
    const existingProject = await this.firebaseService.getProjectByName(name.toLowerCase(), userId);
    if (existingProject) {
      throw new ProjectAlreadyExistsError(name);
    }

    return this.firebaseService.createProject(name, userId);
  }

  async listProjects(userId?: string): Promise<Project[]> {
    return this.firebaseService.listProjects(userId);
  }

  async getProjectById(projectId: string, userId?: string): Promise<Project> {
    const project = await this.firebaseService.getProject(projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }
    return project;
  }

  async updateProject(projectId: string, updates: UpdateProjectRequest, userId?: string): Promise<Project> {
    const project = await this.firebaseService.getProject(projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    if (updates.name) {
      const existingProject = await this.firebaseService.getProjectByName(updates.name.toLowerCase(), userId);
      if (existingProject && existingProject.id !== projectId) {
        throw new ProjectAlreadyExistsError(updates.name);
      }
    }

    return this.firebaseService.updateProject(projectId, updates, userId);
  }

  async deleteProject(projectId: string, userId?: string): Promise<void> {
    const project = await this.firebaseService.getProject(projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    await this.firebaseService.deleteProject(projectId, userId);
  }
}
