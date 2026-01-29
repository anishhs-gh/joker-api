import { Request, Response } from 'express';
import { ProjectService } from '../services/project.service';
import { CreateProjectRequest, UpdateProjectRequest } from '../types/project.types';
import { ValidationError } from '../types/error.types';

export class ProjectController {
  private projectService: ProjectService;

  constructor(projectService: ProjectService) {
    this.projectService = projectService;
  }

  async createProject(req: Request, res: Response) {
    try {
      const { name } = req.body as CreateProjectRequest;

      if (!name) {
        throw new ValidationError('Project name is required');
      }

      const project = await this.projectService.createProject(name);
      res.status(201).json(project);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async listProjects(req: Request, res: Response) {
    try {
      const projects = await this.projectService.listProjects();
      res.json(projects);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getProjectById(req: Request, res: Response) {
    const { projectId } = req.params;
    try {
      const project = await this.projectService.getProjectById(projectId);
      res.json(project);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async updateProject(req: Request, res: Response) {
    const { projectId } = req.params;
    const updates = req.body as UpdateProjectRequest;

    try {
      const project = await this.projectService.updateProject(projectId, updates);
      res.json(project);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async deleteProject(req: Request, res: Response) {
    const { projectId } = req.params;

    try {
      await this.projectService.deleteProject(projectId);
      res.json({ message: 'Project deleted successfully' });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  private handleError(error: any, res: Response) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error.name === 'ProjectNotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    if (error.name === 'ProjectAlreadyExistsError') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
} 