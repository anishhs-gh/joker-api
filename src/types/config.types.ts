export interface FirebaseConfig {
  projectId: string;
  // Optional: path to service account key file
  serviceAccountKeyPath?: string;
  // Optional: service account credentials object (parsed JSON)
  serviceAccountCredentials?: object;
  // If neither is provided, uses Application Default Credentials (ADC)
}

export interface ServerConfig {
  port: number;
  cors: {
    origin: string;
    methods: string[];
  };
  firebase: FirebaseConfig;
} 