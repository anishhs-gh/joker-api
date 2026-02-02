import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { Project, MockEndpoint, CreateEndpointRequest } from '../types';
import { UpdateEndpointRequest } from '../types/endpoint.types';
import { UpdateProjectRequest } from '../types/project.types';
import { ProjectNotFoundError, ProjectAlreadyExistsError } from '../types/error.types';
import { FirebaseConfig } from '../types/config.types';
import logger from '../utils/logger';

export class FirebaseService {
  private db: admin.firestore.Firestore;

  constructor(config: FirebaseConfig) {
    const credential = this.resolveCredential(config);

    admin.initializeApp({
      credential,
      projectId: config.projectId
    });
    this.db = admin.firestore();
  }

  private resolveCredential(config: FirebaseConfig): admin.credential.Credential {
    // Priority 1: Direct credentials object (e.g., from env var)
    if (config.serviceAccountCredentials) {
      return admin.credential.cert(config.serviceAccountCredentials as admin.ServiceAccount);
    }

    // Priority 2: Service account key file path
    if (config.serviceAccountKeyPath) {
      const serviceAccount = JSON.parse(
        fs.readFileSync(config.serviceAccountKeyPath, 'utf-8')
      );
      return admin.credential.cert(serviceAccount);
    }

    // Priority 3: Application Default Credentials (ADC)
    // This uses GOOGLE_APPLICATION_CREDENTIALS env var or GCP metadata service
    return admin.credential.applicationDefault();
  }

  async createProject(name: string, userId?: string): Promise<Project> {
    const nameLower = name.toLowerCase();
    const existingProject = await this.getProjectByName(nameLower, userId);
    if (existingProject) {
      throw new ProjectAlreadyExistsError(name);
    }

    const project: Project = {
      id: this.db.collection('projects').doc().id,
      name,
      nameLower: name.trim().toLowerCase(),
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Remove undefined fields before saving
    const cleanProject = Object.fromEntries(
      Object.entries(project).filter(([_, value]) => value !== undefined)
    );

    await this.db.collection('projects').doc(project.id).set(cleanProject);
    logger.info('Project created', { projectId: project.id, name, userId });
    return project;
  }

  async getProject(projectIdOrName: string, userId?: string): Promise<Project | null> {
    // Try by ID
    const doc = await this.db.collection('projects').doc(projectIdOrName).get();
    if (doc.exists) {
      const project = doc.data() as Project;
      // Check access: public projects (no userId) or owned by user
      if (!project.userId || project.userId === userId) {
        return project;
      }
      // User doesn't have access to this private project
      return null;
    }

    // Try by nameLower (case-insensitive)
    let query = this.db.collection('projects')
      .where('nameLower', '==', projectIdOrName.trim().toLowerCase());

    const snapshot = await query.limit(1).get();

    if (snapshot.empty) return null;

    const project = snapshot.docs[0].data() as Project;
    // Check access
    if (!project.userId || project.userId === userId) {
      return project;
    }
    return null;
  }

  async getProjectByName(name: string, userId?: string): Promise<Project | null> {
    const snapshot = await this.db.collection('projects')
      .where('nameLower', '==', name.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const project = snapshot.docs[0].data() as Project;
    // Check access
    if (!project.userId || project.userId === userId) {
      return project;
    }
    return null;
  }

  async listProjects(userId?: string): Promise<Project[]> {
    // Get public projects (no userId)
    const publicSnapshot = await this.db.collection('projects')
      .where('userId', '==', null)
      .get();

    // Also get projects where userId field doesn't exist (legacy public projects)
    const allSnapshot = await this.db.collection('projects').get();
    const legacyPublicProjects = allSnapshot.docs
      .map(doc => doc.data() as Project)
      .filter(p => p.userId === undefined);

    const publicProjects = publicSnapshot.docs.map(doc => doc.data() as Project);
    const combinedPublic = [...publicProjects, ...legacyPublicProjects];

    // If userId is provided, also get user's private projects
    if (userId) {
      const userSnapshot = await this.db.collection('projects')
        .where('userId', '==', userId)
        .get();
      const userProjects = userSnapshot.docs.map(doc => doc.data() as Project);

      // Combine and deduplicate
      const allProjects = [...combinedPublic, ...userProjects];
      const seen = new Set<string>();
      return allProjects.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    }

    // Deduplicate public projects
    const seen = new Set<string>();
    return combinedPublic.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }

  async updateProject(projectId: string, updates: UpdateProjectRequest, userId?: string): Promise<Project> {
    const project = await this.getProject(projectId, userId);
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
    logger.info('Project updated', { projectId, updates });
    return { ...project, ...updateData };
  }

  async deleteProject(projectId: string, userId?: string): Promise<void> {
    const project = await this.getProject(projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Delete all endpoints for this project (use nameLower since that's how endpoints are stored)
    const endpoints = await this.getEndpoints(project.nameLower, userId);
    const batch = this.db.batch();

    endpoints.forEach(endpoint => {
      batch.delete(this.db.collection('endpoints').doc(endpoint.id));
    });

    batch.delete(this.db.collection('projects').doc(project.id));
    await batch.commit();
    logger.info('Project deleted', { projectId });
  }

  async createEndpoint(data: CreateEndpointRequest, userId?: string): Promise<MockEndpoint> {
    // First verify the project exists and user has access
    const project = await this.getProject(data.projectId, userId);
    if (!project) {
      throw new ProjectNotFoundError(data.projectId);
    }

    // Check for existing endpoint with same path and method
    const existingEndpoints = await this.getEndpoints(data.projectId, userId);
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
      delay: data.delay || 0,
      userId: project.userId,  // Inherit userId from project
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Remove any undefined values before saving to Firestore
    const cleanEndpoint = Object.fromEntries(
      Object.entries(endpoint).filter(([_, value]) => value !== undefined)
    );

    await this.db.collection('endpoints').doc(endpoint.id).set(cleanEndpoint);
    logger.info('Endpoint created', { endpointId: endpoint.id, projectId: data.projectId, path: data.path, method: data.method });
    return endpoint;
  }

  async getEndpoints(projectId: string, userId?: string): Promise<MockEndpoint[]> {
    const snapshot = await this.db.collection('endpoints')
      .where('projectId', '==', projectId)
      .get();

    const endpoints = snapshot.docs.map(doc => doc.data() as MockEndpoint);

    // Filter by access - return endpoints that are public or owned by user
    const accessibleEndpoints = endpoints.filter(e => !e.userId || e.userId === userId);

    // Sort to prioritize private (user-owned) endpoints over public ones
    return accessibleEndpoints.sort((a, b) => {
      const aIsPrivate = a.userId === userId && userId !== undefined;
      const bIsPrivate = b.userId === userId && userId !== undefined;
      if (aIsPrivate && !bIsPrivate) return -1;
      if (!aIsPrivate && bIsPrivate) return 1;
      return 0;
    });
  }

  async updateEndpoint(projectId: string, endpointId: string, updates: UpdateEndpointRequest, userId?: string): Promise<MockEndpoint> {
    const endpoint = await this.db.collection('endpoints').doc(endpointId).get();
    if (!endpoint.exists) {
      throw new Error('Endpoint not found');
    }

    const endpointData = endpoint.data() as MockEndpoint;

    // Check access
    if (endpointData.userId && endpointData.userId !== userId) {
      throw new Error('Endpoint not found');
    }

    const updateData: Partial<MockEndpoint> = {
      ...updates,
      updatedAt: Date.now()
    };

    await this.db.collection('endpoints').doc(endpointId).update(updateData);
    logger.info('Endpoint updated', { endpointId, projectId, updates });
    return { ...endpointData, ...updateData };
  }

  async deleteEndpoint(projectId: string, endpointId: string, userId?: string): Promise<void> {
    const endpoint = await this.db.collection('endpoints').doc(endpointId).get();
    if (!endpoint.exists) {
      throw new Error('Endpoint not found');
    }

    const endpointData = endpoint.data() as MockEndpoint;

    // Check access
    if (endpointData.userId && endpointData.userId !== userId) {
      throw new Error('Endpoint not found');
    }

    await this.db.collection('endpoints').doc(endpointId).delete();
    logger.info('Endpoint deleted', { endpointId, projectId });
  }

  // Log operations
  async saveLog(logEntry: {
    timestamp: Date;
    method: string;
    path: string;
    projectId: string;
    requestHeaders: Record<string, string>;
    requestBody: any;
    responseStatus: number;
    responseBody: any;
  }): Promise<string> {
    const docRef = await this.db.collection('logs').add({
      ...logEntry,
      timestamp: logEntry.timestamp.getTime(),
    });
    return docRef.id;
  }

  async getLogs(projectId: string, limit: number = 100): Promise<any[]> {
    const snapshot = await this.db.collection('logs')
      .where('projectId', '==', projectId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: new Date(doc.data().timestamp),
    })).reverse();
  }

  async clearLogs(projectId: string): Promise<number> {
    const snapshot = await this.db.collection('logs')
      .where('projectId', '==', projectId)
      .get();

    const batch = this.db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    logger.info('Logs cleared', { projectId, count: snapshot.size });
    return snapshot.size;
  }
}
