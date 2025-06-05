import * as admin from 'firebase-admin';
import { MockEndpoint, Project } from '../types';

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

export class FirebaseService {
  private projectsCollection = db.collection('projects');
  private endpointsCollection = db.collection('endpoints');

  // Project operations
  async migrateProjectsToIncludeNameLower(): Promise<void> {
    const snapshot = await this.projectsCollection.get();
    const batch = db.batch();
    let migrationCount = 0;

    for (const doc of snapshot.docs) {
      const project = doc.data() as Project;
      if (!project.nameLower) {
        const updatedProject = {
          ...project,
          nameLower: project.name.toLowerCase()
        };
        batch.update(doc.ref, updatedProject);
        migrationCount++;
      }
    }

    if (migrationCount > 0) {
      await batch.commit();
      console.log(`Migrated ${migrationCount} projects to include nameLower`);
    }
  }

  async createProject(name: string): Promise<Project> {
    // Validate project name
    if (!name || typeof name !== 'string') {
      throw new Error('Project name is required and must be a string');
    }

    // Trim whitespace and convert to lowercase for comparison
    const normalizedName = name.trim().toLowerCase();
    if (normalizedName.length === 0) {
      throw new Error('Project name cannot be empty');
    }

    // Check for valid characters (alphanumeric, hyphens, underscores)
    if (!/^[a-z0-9-_]+$/.test(normalizedName)) {
      throw new Error('Project name can only contain lowercase letters, numbers, hyphens, and underscores');
    }

    // Check if project with same name exists (case-insensitive)
    const snapshot = await this.projectsCollection
      .where('nameLower', '==', normalizedName)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      throw new Error(`Project "${name}" already exists`);
    }

    const projectRef = this.projectsCollection.doc();
    const project: Project = {
      id: projectRef.id,
      name: name.trim(),
      nameLower: normalizedName,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await projectRef.set(project);
    return project;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const doc = await this.projectsCollection.doc(projectId).get();
    return doc.exists ? (doc.data() as Project) : null;
  }

  async getProjectByName(name: string): Promise<Project | null> {
    if (!name || typeof name !== 'string') {
      return null;
    }

    const normalizedName = name.trim().toLowerCase();
    const snapshot = await this.projectsCollection
      .where('nameLower', '==', normalizedName)
      .limit(1)
      .get();

    return snapshot.empty ? null : (snapshot.docs[0].data() as Project);
  }

  async listProjects(): Promise<Project[]> {
    const snapshot = await this.projectsCollection.get();
    return snapshot.docs.map(doc => doc.data() as Project);
  }

  // Endpoint operations
  async createEndpoint(endpoint: Omit<MockEndpoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<MockEndpoint> {
    // Get project by name
    const project = await this.getProjectByName(endpoint.projectId);
    if (!project) {
      throw new Error(`Project "${endpoint.projectId}" not found`);
    }

    // Check for existing endpoint with same path and method
    const existingEndpoints = await this.endpointsCollection
      .where('projectId', '==', project.name)
      .where('path', '==', endpoint.path)
      .where('method', '==', endpoint.method)
      .get();

    if (!existingEndpoints.empty) {
      throw new Error(`Endpoint "${endpoint.method} ${endpoint.path}" already exists in project "${project.name}"`);
    }

    const endpointRef = this.endpointsCollection.doc();
    const now = Date.now();
    const newEndpoint: MockEndpoint = {
      ...endpoint,
      id: endpointRef.id,
      projectId: project.name,
      createdAt: now,
      updatedAt: now
    };

    await endpointRef.set(newEndpoint);
    return newEndpoint;
  }

  async getEndpoints(projectId: string): Promise<MockEndpoint[]> {
    // First try to get project by name
    let project = await this.getProjectByName(projectId);
    
    // If not found by name, try to get by ID
    if (!project) {
      project = await this.getProject(projectId);
    }

    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    // Query endpoints using both project name and ID to handle migration
    const snapshot = await this.endpointsCollection
      .where('projectId', 'in', [project.name, project.id])
      .get();
    
    return snapshot.docs.map(doc => doc.data() as MockEndpoint);
  }

  async deleteEndpoint(projectId: string, endpointId: string): Promise<boolean> {
    // Get project by name
    const project = await this.getProjectByName(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    const doc = await this.endpointsCollection.doc(endpointId).get();
    if (!doc.exists) {
      return false;
    }

    const endpoint = doc.data() as MockEndpoint;
    if (endpoint.projectId !== project.name) {
      throw new Error(`Endpoint "${endpointId}" does not belong to project "${project.name}"`);
    }

    await doc.ref.delete();
    return true;
  }

  async updateEndpoint(
    projectId: string,
    endpointId: string,
    updates: Partial<MockEndpoint>
  ): Promise<MockEndpoint | null> {
    const project = await this.getProjectByName(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    const doc = await this.endpointsCollection.doc(endpointId).get();
    if (!doc.exists) {
      throw new Error(`Endpoint "${endpointId}" not found`);
    }

    const currentData = doc.data() as MockEndpoint;
    if (currentData.projectId !== project.name) {
      throw new Error(`Endpoint "${endpointId}" does not belong to project "${project.name}"`);
    }
    
    // If updating path or method, check for conflicts
    if ((updates.path || updates.method) && (updates.path !== currentData.path || updates.method !== currentData.method)) {
      const newPath = updates.path || currentData.path;
      const newMethod = updates.method || currentData.method;
      
      const conflictCheck = await this.endpointsCollection
        .where('projectId', '==', project.name)
        .where('path', '==', newPath)
        .where('method', '==', newMethod)
        .get();

      if (!conflictCheck.empty) {
        throw new Error(`Endpoint "${newMethod} ${newPath}" already exists in project "${project.name}"`);
      }
    }

    const updatedData = {
      ...currentData,
      ...updates,
      updatedAt: Date.now()
    };

    await doc.ref.update(updatedData);
    return updatedData;
  }

  async migrateEndpointsToUseProjectNames(): Promise<void> {
    const snapshot = await this.endpointsCollection.get();
    const batch = db.batch();
    let migrationCount = 0;

    for (const doc of snapshot.docs) {
      const endpoint = doc.data() as MockEndpoint;
      const project = await this.getProject(endpoint.projectId);
      
      if (project) {
        const updatedEndpoint = {
          ...endpoint,
          projectId: project.name
        };
        batch.update(doc.ref, updatedEndpoint);
        migrationCount++;
      }
    }

    if (migrationCount > 0) {
      await batch.commit();
      console.log(`Migrated ${migrationCount} endpoints to use project names`);
    }
  }

  async updateProject(projectId: string, updates: { name?: string }): Promise<Project | null> {
    const project = await this.getProjectByName(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    if (updates.name) {
      const normalizedName = updates.name.trim().toLowerCase();
      
      // Validate new name
      if (normalizedName.length === 0) {
        throw new Error('Project name cannot be empty');
      }
      if (!/^[a-z0-9-_]+$/.test(normalizedName)) {
        throw new Error('Project name can only contain lowercase letters, numbers, hyphens, and underscores');
      }

      // Check if new name already exists
      const existingProject = await this.getProjectByName(updates.name);
      if (existingProject && existingProject.id !== project.id) {
        throw new Error(`Project "${updates.name}" already exists`);
      }

      // Update project name
      const updatedProject = {
        ...project,
        name: updates.name.trim(),
        nameLower: normalizedName,
        updatedAt: Date.now()
      };

      await this.projectsCollection.doc(project.id).update(updatedProject);
      return updatedProject;
    }

    return null;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const project = await this.getProjectByName(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    // Delete all endpoints for this project
    const endpoints = await this.getEndpoints(project.name);
    const batch = db.batch();
    
    // Delete endpoints
    for (const endpoint of endpoints) {
      const endpointDoc = await this.endpointsCollection
        .where('projectId', '==', project.name)
        .where('path', '==', endpoint.path)
        .where('method', '==', endpoint.method)
        .get();
      
      if (!endpointDoc.empty) {
        batch.delete(endpointDoc.docs[0].ref);
      }
    }

    // Delete project
    batch.delete(this.projectsCollection.doc(project.id));
    
    await batch.commit();
    return true;
  }
} 