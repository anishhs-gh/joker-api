export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project with ID ${projectId} not found`);
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectAlreadyExistsError extends Error {
  constructor(name: string) {
    super(`Project already exists: ${name}`);
    this.name = 'ProjectAlreadyExistsError';
  }
}

export class EndpointNotFoundError extends Error {
  constructor(endpointId: string) {
    super(`Endpoint with ID ${endpointId} not found`);
    this.name = 'EndpointNotFoundError';
  }
}

export class EndpointAlreadyExistsError extends Error {
  constructor(path: string, method: string) {
    super(`Endpoint with path ${path} and method ${method} already exists`);
    this.name = 'EndpointAlreadyExistsError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
} 