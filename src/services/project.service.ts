import { Project } from '../types';
import { CreateProjectRequest, UpdateProjectRequest } from '../types/project.types';
import { ProjectNotFoundError, ProjectAlreadyExistsError } from '../types/error.types';
import { FirebaseService } from './firebase.service';

export class ProjectService {
  private firebaseService: FirebaseService;

  constructor(firebaseService: FirebaseService) {
    this.firebaseService = firebaseService;
  }

  async createProject(name: string): Promise<Project> {
    const existingProject = await this.firebaseService.getProjectByName(name.toLowerCase());
    if (existingProject) {
      throw new ProjectAlreadyExistsError(name);
    }

    return this.firebaseService.createProject(name);
  }

  async listProjects(): Promise<Project[]> {
    return this.firebaseService.listProjects();
  }

  async getProjectById(projectId: string): Promise<Project> {
    const project = await this.firebaseService.getProject(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }
    return project;
  }

  async updateProject(projectId: string, updates: UpdateProjectRequest): Promise<Project> {
    const project = await this.firebaseService.getProject(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    if (updates.name) {
      const existingProject = await this.firebaseService.getProjectByName(updates.name.toLowerCase());
      if (existingProject && existingProject.id !== projectId) {
        throw new ProjectAlreadyExistsError(updates.name);
      }
    }

    return this.firebaseService.updateProject(projectId, updates);
  }

  async deleteProject(projectId: string): Promise<void> {
    const project = await this.firebaseService.getProject(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    await this.firebaseService.deleteProject(projectId);
  }
} 