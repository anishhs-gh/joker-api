import { MockEndpoint } from './endpoint.types';

export interface MockConfig {
  endpoints: MockEndpoint[];
  port?: number;
}

export interface ServerConfig {
  port: number;
  cors: {
    origin: string;
    methods: string[];
  };
  firebase: {
    projectId: string;
    serviceAccountKeyPath: string;
  };
} 