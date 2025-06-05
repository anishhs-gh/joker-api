export interface MockEndpoint {
  id: string;
  projectId: string;
  path: string;
  method: string;
  response: any;
  statusCode?: number;
  delay?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateEndpointRequest {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  response: any;
  statusCode?: number;
  delay?: number;
  projectId: string;
}

export interface MockConfig {
  endpoints: MockEndpoint[];
  port?: number;
}

export interface Project {
  id: string;
  name: string;
  nameLower: string;
  createdAt: number;
  updatedAt: number;
} 