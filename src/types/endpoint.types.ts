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
  statusCode?: number;
  delay?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEndpointRequest {
  projectId: string;
  path: string;
  method: string;
  response: {
    status: number;
    body: any;
    headers?: Record<string, string>;
  };
  statusCode?: number;
  delay?: number;
}

export interface UpdateEndpointRequest {
  path?: string;
  method?: string;
  response?: {
    status?: number;
    body?: any;
    headers?: Record<string, string>;
  };
  statusCode?: number;
  delay?: number;
} 