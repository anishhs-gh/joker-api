# Frontend Integration Guide

**Generated Date:** January 30, 2026
**Backend Context:** `joker-api` v1.0.0

This document outlines the API contracts, features, and constraints that the frontend application must support to integrate with the `joker-api` backend.

## 1. API Architecture

The API is split into two distinct "planes":

1.  **Control Plane** (`/_mock-api/...`): Used to manage Projects and Mock Endpoints.
2.  **Mock Plane** (`/:projectId/...`): Used to execute the user-defined mock endpoints.

### Base URL
*   Development: `http://localhost:3000` (default)
*   Production: *(Check environment variables)*

---

## 2. Control Plane Integration (Management UI)

### Projects
*   **List Projects:** `GET /_mock-api/projects`
*   **Create Project:** `POST /_mock-api/projects`
    *   Body: `{ "name": "My Project", "description": "Optional" }`
    *   *Note:* `name` is required.
*   **Get Project:** `GET /_mock-api/projects/:projectId`
*   **Update Project:** `PATCH /_mock-api/projects/:projectId`
*   **Delete Project:** `DELETE /_mock-api/projects/:projectId`
    *   *Warning:* Cascading delete. Deletes all associated endpoints.

### Mock Endpoints
*   **List Endpoints:** `GET /_mock-api/projects/:projectId/endpoints`
*   **Create Endpoint:** `POST /_mock-api/projects/:projectId/endpoints`
    *   Body:
        ```json
        {
          "path": "/users",
          "method": "GET",
          "response": {
            "status": 200,
            "body": { "users": [] },
            "headers": { "X-Custom": "Value" }
          },
          "delay": 500
        }
        ```
    *   *Validation:* `path`, `method`, `response.status`, and `response.body` are mandatory. `response.body` must be an object.
*   **Update Endpoint:** `PATCH /_mock-api/projects/:projectId/endpoints/:endpointId`
*   **Delete Endpoint:** `DELETE /_mock-api/projects/:projectId/endpoints/:endpointId`

---

## 3. Real-Time Logs (WebSocket)

The backend provides a WebSocket connection to stream request logs for a specific project.

*   **Connection URL:** `ws://host:port/ws/logs?projectId=YOUR_PROJECT_ID`
*   **Protocol:** JSON messages.

### Client -> Server Commands
1.  **Get History:** Request past logs.
    ```json
    { "command": "getHistory", "limit": 50 }
    ```
2.  **Clear Logs:** Delete logs for this project (server-side).
    ```json
    { "command": "clearLogs" }
    ```
3.  **Ping:** Keep-alive check.
    ```json
    { "command": "ping" }
    ```

### Server -> Client Events
1.  **New Log:** Received when a mock request is hit.
    ```json
    {
      "type": "log",
      "timestamp": "2023-01-01T12:00:00Z",
      "method": "GET",
      "path": "/users",
      "projectId": "...",
      "requestBody": {},
      "responseStatus": 200,
      "responseBody": {}
    }
    ```
2.  **History:** Response to `getHistory`.
    ```json
    { "type": "history", "logs": [ ... ] }
    ```
3.  **Cleared:** Confirmation of `clearLogs`.
    ```json
    { "type": "cleared", "message": "Logs cleared" }
    ```
4.  **Pong:** Response to `ping`.

---

## 4. Error Handling & Edge Cases

The frontend must robustly handle the following scenarios:

### API Error Formats
*   **Validation / 400:** `{ "error": "Description of invalid field" }`
*   **Not Found / 404:** `{ "error": "Item not found" }`
*   **Conflict / 409:** `{ "error": "Project/Endpoint already exists" }`
*   **Server Error / 500:** `{ "error": "Internal server error" }` or `{ "message": "..." }`
    *   *Advice:* Check for both `error` and `message` properties in response payloads.

### Rate Limiting (429)
*   The API enforces a limit of **100 requests per 15 minutes** per IP.
*   **Response:** Status `429 Too Many Requests`.
*   **Action:** UI should display a "You are being rate limited" banner or disable retry buttons temporarily.

### Network / CORS
*   Ensure the frontend domain is whitelisted in the backend `CORS_ORIGIN` configuration.
*   Handle connection loss for WebSockets (implement auto-reconnect logic).

## 5. UI Implementation Recommendations

1.  **Response Editor:** When creating endpoints, use a JSON code editor (like Monaco or CodeMirror) for the `response.body` field to ensure valid JSON is sent.
2.  **Delay Simulation:** Add a slider or input for `delay` (ms) to help users test loading states in their own apps.
3.  **Log Viewer:**
    *   Display logs in a table or list sorted by `timestamp` (descending).
    *   Color-code rows based on `responseStatus` (Green: 2xx, Yellow: 4xx, Red: 5xx).
    *   Provide a "Clear Logs" button that sends the `clearLogs` WebSocket command.
4.  **Path Validation:** Ensure users include the leading slash `/` in endpoint paths (or auto-prefix it).
