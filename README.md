# Dynamic Mock API Service with Firebase

A flexible mock API service built with Node.js, TypeScript, and Firebase that allows you to create and manage project-based mock endpoints for development and testing purposes.

## Features

- Create and manage multiple projects
- Create custom API endpoints dynamically through API
- Support for all HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Configure response data, status codes, and response delays
- CORS enabled by default
- TypeScript support
- Hot reloading during development
- Firebase Firestore persistence
- Project-based endpoint organization

## Project Structure

```
src/
├── controllers/           # HTTP request handlers
│   ├── project.controller.ts
│   └── endpoint.controller.ts
├── services/             # Business logic
│   ├── firebase.service.ts
│   ├── project.service.ts
│   └── endpoint.service.ts
├── types/               # TypeScript type definitions
│   ├── index.ts
│   ├── endpoint.types.ts
│   ├── project.types.ts
│   ├── config.types.ts
│   └── error.types.ts
├── server.ts            # Express application setup
└── index.ts            # Application entry point
```

## Prerequisites

1. Firebase project with Firestore enabled
2. Firebase service account key (serviceAccountKey.json)

## Environment Variables

The following environment variables can be configured:

- `PORT`: Server port (default: 3000)
- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_SERVICE_ACCOUNT_KEY_PATH`: Path to your Firebase service account key file (default: ./serviceAccountKey.json)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Place your Firebase service account key in the root directory as `serviceAccountKey.json`

## Usage

1. Start the server:
```bash
# Development mode with hot reloading
npm run dev

# Production mode
npm start
```

2. Create a project:
```bash
curl -X POST http://localhost:3000/_mock-api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-test-project"
  }'
```

3. Create endpoints for your project:
```bash
curl -X POST http://localhost:3000/_mock-api/projects/{projectId}/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/products",
    "method": "GET",
    "response": [
      { "id": 1, "name": "Product 1" }
    ],
    "statusCode": 200,
    "delay": 500
  }'
```

## Management API Endpoints

### Projects

#### Create Project
```bash
POST /_mock-api/projects
Content-Type: application/json

{
  "name": "my-test-project"
}
```

Response:
- 201: Project created successfully
- 400: Invalid project name
- 409: Project already exists
- 500: Server error

#### List Projects
```bash
GET /_mock-api/projects
```

Response:
- 200: List of projects
- 500: Server error

#### Update Project
```bash
PATCH /_mock-api/projects/{projectId}
Content-Type: application/json

{
  "name": "new-project-name"
}
```

Response:
- 200: Updated project
- 400: Invalid update data
- 404: Project not found
- 409: New name already exists
- 500: Server error

#### Delete Project
```bash
DELETE /_mock-api/projects/{projectId}
```

Response:
- 200: Project deleted successfully
- 404: Project not found
- 500: Server error

### Endpoints

#### List Project Endpoints
```bash
GET /_mock-api/projects/{projectId}/endpoints
```

Response:
- 200: List of endpoints
- 404: Project not found
- 500: Server error

#### Create Endpoint
```bash
POST /_mock-api/projects/{projectId}/endpoints
Content-Type: application/json

{
  "path": "/api/products",
  "method": "GET",
  "response": [
    { "id": 1, "name": "Product 1" }
  ],
  "statusCode": 200,
  "delay": 500
}
```

Response:
- 201: Endpoint created successfully
- 400: Missing required fields
- 404: Project not found
- 409: Endpoint already exists
- 500: Server error

#### Update Endpoint
```bash
PATCH /_mock-api/projects/{projectId}/endpoints/{endpointId}
Content-Type: application/json

{
  "path": "/api/products",
  "method": "GET",
  "response": [
    { "id": 1, "name": "Updated Product" }
  ],
  "statusCode": 200,
  "delay": 1000
}
```

Response:
- 200: Endpoint updated successfully
- 400: Invalid update data
- 404: Project or endpoint not found
- 500: Server error

#### Delete Endpoint
```bash
DELETE /_mock-api/projects/{projectId}/endpoints/{endpointId}
```

Response:
- 200: Endpoint deleted successfully
- 404: Project or endpoint not found
- 500: Server error

## Accessing Endpoints

All endpoints are accessible under their project's namespace:

```bash
# If your project ID is "abc123" and you created an endpoint at "/api/products"
curl http://localhost:3000/abc123/api/products
```

## Configuration Options

Each endpoint can be configured with the following options:

- `path`: The API endpoint path (e.g., '/api/products')
- `method`: HTTP method ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')
- `response`: The response data to return
- `statusCode`: HTTP status code (defaults to 200)
- `delay`: Response delay in milliseconds (optional)

## Example Usage

1. Create a project:
```bash
curl -X POST http://localhost:3000/_mock-api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ecommerce-api"
  }'
```

2. Create a GET endpoint:
```bash
curl -X POST http://localhost:3000/_mock-api/projects/{projectId}/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/products",
    "method": "GET",
    "response": [
      { "id": 1, "name": "Product 1" },
      { "id": 2, "name": "Product 2" }
    ]
  }'
```

3. Create a POST endpoint with delay:
```bash
curl -X POST http://localhost:3000/_mock-api/projects/{projectId}/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/orders",
    "method": "POST",
    "response": { "message": "Order created", "id": 123 },
    "statusCode": 201,
    "delay": 1000
  }'
```

4. Test your endpoints:
```bash
# Test GET endpoint
curl http://localhost:3000/{projectId}/api/products

# Test POST endpoint
curl -X POST http://localhost:3000/{projectId}/api/orders
```

## License

ISC 