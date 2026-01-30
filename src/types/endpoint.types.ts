export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface MockEndpoint {
  id: string;
  projectId: string;
  path: string;
  method: string;
  response: {
    status: number;
    body: any;
    headers?: Record<string, string>;
  };
  delay?: number;
  userId?: string;  // Inherited from project
  createdAt: number;
  updatedAt: number;
}

export interface CreateEndpointRequest {
  projectId: string;
  path: string;
  method: HttpMethod;
  response: {
    status: number;
    body: any;
    headers?: Record<string, string>;
  };
  delay?: number;
}

export interface UpdateEndpointRequest {
  path?: string;
  method?: HttpMethod;
  response?: {
    status: number;
    body: any;
    headers?: Record<string, string>;
  };
  delay?: number;
}

export interface MockConfig {
  endpoints: MockEndpoint[];
  port?: number;
} 