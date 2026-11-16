# Playground Session Management — Detailed Report

## Overview

Phase 41 completes the Multi-Model Playground by adding session persistence, session management UI, and comparison exports (JSON/CSV).

## Data Model

### AiPlaygroundSession

```typescript
interface AiPlaygroundSession {
  id: string                    // session_<uuid>
  workspaceId: string
  name: string
  prompt: string                // User's prompt
  systemPrompt?: string         // Optional system prompt
  createdAt: number             // Unix ms
  updatedAt: number             // Unix ms
  createdBy: string             // User ID
}
```

### AiPlaygroundResponse

```typescript
interface AiPlaygroundResponse {
  id: string                    // response_<uuid>
  sessionId: string
  providerId: string
  providerKind: string
  modelId: string
  modelName: string
  prompt: string                // Copy of session prompt at time of execution
  systemPrompt?: string         // Copy of session system prompt
  response: string              // Model's response
  latencyMs: number
  error?: string                // If execution failed
  timestamp: number             // Unix ms
}
```

## Collections

- `aiPlaygroundSessions` — Session metadata (CRUD)
- `aiPlaygroundResponses` — Per-model responses within sessions (append-only per session)

Both collections implemented in JSON and SQLite stores.

## API Endpoints

### Session CRUD

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/playground/sessions` | Create session |
| GET | `/api/ai/playground/sessions` | List sessions (paginated) |
| PATCH | `/api/ai/playground/sessions/:id` | Update session (name, systemPrompt) |
| DELETE | `/api/ai/playground/sessions/:id` | Delete session + responses |

### Responses

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/playground/sessions/:id/responses` | Get all responses for session |

### Exports

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/playground/export/:sessionId` | JSON export |
| GET | `/api/ai/playground/export/comparison/:sessionId` | CSV export |

## Export Formats

### JSON Export

```json
{
  "session": { ...AiPlaygroundSession },
  "responses": [ ...AiPlaygroundResponse ],
  "exportedAt": "2026-11-16T...",
  "exportedBy": "user@example.com",
  "version": "1.0"
}
```

### CSV Export

Columns: `Provider,Model,Latency (ms),Response,Error`

```csv
Provider,Model,Latency (ms),Response,Error
"Ollama","llama3.1:8b",1250,"The answer is 42.",""
"OpenAI","gpt-4o",890,"The answer is 42.",""
"Local","heuristics-v1",45,"The answer is 42.",""
```

## Execution Flow

### Creating a Comparison Session

1. User enters prompt + optional system prompt in Playground
2. Clicks "Save as Session" → `POST /api/ai/playground/sessions`
3. Session created with name + prompt
4. User clicks "Run Comparison" for desired models
5. Each model execution creates `AiPlaygroundResponse` linked to session
6. Responses displayed side-by-side in Playground UI

### Managing Sessions

- **Playground Session Manager** (`/app/ai/playground-sessions`) lists all sessions
- Click session → view details + all responses
- Rename session inline
- Delete session (cascades to responses)
- Export buttons for JSON/CSV

## Security

- All endpoints require `ai:write` (create/update/delete) or `ai:read` (list/view/export)
- Workspace isolation: users only see sessions from their workspace
- Ownership: `createdBy` tracked; future: users can only modify own sessions (admin override)
- No credentials in exports
- Exports include metadata (who, when, version) for auditability

## UI: Playground Session Manager

Page: `/app/ai/playground-sessions`

Features:
- Table with Name, Prompt preview, Created, Updated, Response count, Actions
- Search/filter by name
- Pagination (server-side)
- Inline rename
- Delete with confirmation
- Export JSON / Export CSV buttons per session
- Click row → expand to show all responses with latency, error status

## UI: Multi-Model Playground Integration

Page: `/app/ai/playground` (Phase 40)

Enhancements:
- "Save as Session" button after running comparison
- Session name input modal
- Saved sessions accessible from Session Manager
- Responses persist across page reloads

## Verification

### Unit Tests (`tests/ai-benchmark.test.ts` and `tests/api.test.ts`)

- Session CRUD operations
- Response linking to session
- Cascade delete (session → responses)
- JSON export structure
- CSV export columns and escaping
- Workspace isolation
- Authorization checks

### Live Verification

- Create session from Playground with 3 models
- View session in Session Manager with all 3 responses
- Rename session
- Export JSON → valid structure with metadata
- Export CSV → correct columns, proper escaping of commas/quotes
- Delete session → session and responses removed
- Workspace isolation verified (different workspaces see different sessions)

## Limitations

1. **No response editing** — Responses are append-only; re-run creates new response
2. **No sharing** — Sessions private to workspace; no public links
3. **No versioning** — Prompt changes create new session, not version
4. **No diff view** — CSV/JSON exports are snapshots; no diff between runs
5. **Single workspace** — No cross-workspace session access

## Future Enhancements

1. **Session versioning** — Track prompt/response history within session
2. **Response diff** — Highlight differences between model outputs
3. **Shared sessions** — Generate read-only links for stakeholders
4. **Annotation/notes** — Add human evaluation notes to responses
5. **Bulk export** — Export all sessions in workspace
6. **Import** — Import sessions from JSON (migration, sharing)