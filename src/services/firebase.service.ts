import * as admin from 'firebase-admin';
import { Project, MockEndpoint, CreateEndpointRequest } from '../types';
import { UpdateEndpointRequest } from '../types/endpoint.types';
import { UpdateProjectRequest } from '../types/project.types';
import { ProjectNotFoundError, ProjectAlreadyExistsError } from '../types/error.types';

export class FirebaseService {
  private db: admin.firestore.Firestore;

  constructor(config: { projectId: string; serviceAccountKeyPath: string }) {
    const serviceAccount = require(config.serviceAccountKeyPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: config.projectId
    });
    this.db = admin.firestore();
  }

  async createProject(name: string): Promise<Project> {
    const nameLower = name.toLowerCase();
    const existingProject = await this.getProjectByName(nameLower);
    if (existingProject) {
      throw new ProjectAlreadyExistsError(name);
    }

    const project: Project = {
      id: this.db.collection('projects').doc().id,
      name,
      nameLower: name.trim().toLowerCase(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.db.collection('projects').doc(project.id).set(project);
    return project;
  }

  async getProject(projectIdOrName: string): Promise<Project | null> {
    // Try by ID
    const doc = await this.db.collection('projects').doc(projectIdOrName).get();
    if (doc.exists) return doc.data() as Project;

    // Try by nameLower (case-insensitive)
    const snapshot = await this.db.collection('projects')
      .where('nameLower', '==', projectIdOrName.trim().toLowerCase())
      .limit(1)
      .get();

    return snapshot.empty ? null : (snapshot.docs[0].data() as Project);
  }

  async getProjectByName(name: string): Promise<Project | null> {
    const snapshot = await this.db.collection('projects')
      .where('nameLower', '==', name.toLowerCase())
      .limit(1)
      .get();

    return snapshot.empty ? null : (snapshot.docs[0].data() as Project);
  }

  async listProjects(): Promise<Project[]> {
    const snapshot = await this.db.collection('projects').get();
    return snapshot.docs.map(doc => doc.data() as Project);
  }

  async updateProject(projectId: string, updates: UpdateProjectRequest): Promise<Project> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    const updateData: Partial<Project> = {
      ...updates,
      updatedAt: Date.now()
    };

    if (updates.name) {
      updateData.nameLower = updates.name.toLowerCase();
    }

    await this.db.collection('projects').doc(projectId).update(updateData);
    return { ...project, ...updateData };
  }

  async deleteProject(projectId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Delete all endpoints for this project
    const endpoints = await this.getEndpoints(projectId);
    const batch = this.db.batch();
    
    endpoints.forEach(endpoint => {
      batch.delete(this.db.collection('endpoints').doc(endpoint.id));
    });
    
    batch.delete(this.db.collection('projects').doc(project.id));
    await batch.commit();
  }

  async createEndpoint(data: CreateEndpointRequest): Promise<MockEndpoint> {
    // First verify the project exists
    const project = await this.getProject(data.projectId);
    if (!project) {
      throw new ProjectNotFoundError(data.projectId);
    }

    // Check for existing endpoint with same path and method
    const existingEndpoints = await this.getEndpoints(data.projectId);
    const existingEndpoint = existingEndpoints.find(
      e => e.path === data.path && e.method === data.method
    );

    if (existingEndpoint) {
      throw new Error(`Endpoint with path ${data.path} and method ${data.method} already exists`);
    }

    const endpoint: MockEndpoint = {
      id: this.db.collection('endpoints').doc().id,
      projectId: project.nameLower,
      path: data.path,
      method: data.method,
      response: data.response,
      statusCode: data.statusCode || data.response.status,
      delay: data.delay || 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Remove any undefined values before saving to Firestore
    const cleanEndpoint = Object.fromEntries(
      Object.entries(endpoint).filter(([_, value]) => value !== undefined)
    );

    await this.db.collection('endpoints').doc(endpoint.id).set(cleanEndpoint);
    return endpoint;
  }

  async getEndpoints(projectId: string): Promise<MockEndpoint[]> {
    const snapshot = await this.db.collection('endpoints')
      .where('projectId', '==', projectId)
      .get();

    return snapshot.docs.map(doc => doc.data() as MockEndpoint);
  }

  async updateEndpoint(projectId: string, endpointId: string, updates: UpdateEndpointRequest): Promise<MockEndpoint> {
    const endpoint = await this.db.collection('endpoints').doc(endpointId).get();
    if (!endpoint.exists) {
      throw new Error('Endpoint not found');
    }

    const updateData: Partial<MockEndpoint> = {
      ...updates,
      updatedAt: Date.now()
    };

    await this.db.collection('endpoints').doc(endpointId).update(updateData);
    return { ...endpoint.data() as MockEndpoint, ...updateData };
  }

  async deleteEndpoint(projectId: string, endpointId: string): Promise<void> {
    const endpoint = await this.db.collection('endpoints').doc(endpointId).get();
    if (!endpoint.exists) {
      throw new Error('Endpoint not found');
    }

    await this.db.collection('endpoints').doc(endpointId).delete();
  }
} 