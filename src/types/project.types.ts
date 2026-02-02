export interface Project {
  id: string;
  name: string;
  nameLower: string;
  description?: string;
  userId?: string;  // Owner's Firebase UID (null/undefined = public)
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
} 