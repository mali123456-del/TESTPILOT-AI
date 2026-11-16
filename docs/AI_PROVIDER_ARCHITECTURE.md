# AI Provider Architecture (Phase 40)

## Overview

TESTPILOT AI's AI provider architecture supports multiple provider types with per-workspace configuration, encrypted credentials at rest, health monitoring, connection testing, and model discovery. The architecture is designed to be secure by default: credentials are never exposed in API responses, never logged, and masked in the UI.

## Provider Types

| Provider | Kind | Description | Status |
|---|---|---|---|
| Local heuristics | `local` | Deterministic, offline rule engine built into TESTPILOT AI | Always available |
| Ollama | `ollama` | Local LLM via Ollama `/api/chat` endpoint | Configurable per workspace |
| OpenAI-compatible | `openai-compatible` | Any OpenAI-compatible chat API via `/chat/completions` | Configurable per workspace |

## Architecture Layers

### 1. Provider Configuration Layer (`server/routes/providers.ts`)

REST API for managing provider configurations per workspace:

- `GET /api/ai/providers` — List providers (public view, no credentials)
- `POST /api/ai/providers` — Create provider (admin+)
- `PATCH /api/ai/providers/:id` — Edit provider (admin+)
- `DELETE /api/ai/providers/:id` — Remove provider (admin+)
- `POST /api/ai/providers/:id/credentials` — Set/update credentials (admin+)
- `DELETE /api/ai/providers/:id/credentials` — Remove credentials (admin+)
- `POST /api/ai/providers/:id/test` — Connection test (tester+)
- `GET /api/ai/providers/:id/health` — Health check (tester+)

### 2. Provider Logic Layer (`server/ai/provider.ts`)

- `callProvider(config, messages, options)` — Call a specific provider config with timeout and error handling
- `checkProviderHealth(config)` — Health check: endpoint reachability, model listing
- `testProviderConnection(config)` — Full connection test: DNS, endpoint, auth, model, valid response
- `encryptCredential` / `decryptCredential` — AES-256-GCM credential encryption
- `maskCredential` — Safe UI display masking

### 3. Model Registry Layer

Stored in `Database.aiModels` collection. Each entry records verified capabilities only — nothing is inferred or invented.

### 4. Storage Layer

New collections added to `Database` interface:
- `aiProviders` — Provider configurations (no credentials in the config itself)
- `aiModels` — Model registry entries
- `providerHealthChecks` — Health check results
- `providerConnectionTests` — Connection test results
- `providerActivities` — Append-only activity/audit log
- `aiRoutingConfig` — Intelligent routing configuration

Works with both JSON (`JsonStorageAdapter`) and SQLite (`SqliteStorageAdapter`) adapters.

### 5. Credential Security

Credentials are stored separately from provider configs, encrypted with AES-256-GCM using `TESTPILOT_ENCRYPTION_KEY`:

```
Credential lifecycle:
1. User submits API key via POST /providers/:id/credentials
2. Key is encrypted with AES-256-GCM (IV + auth tag + ciphertext)
3. Encrypted value stored in memory cache (credentialCache)
4. Provider config marked credentialsConfigured=true
5. On provider call, key is decrypted from cache and used in Authorization header
6. API responses never include the key or its mask; UI shows ***<last4>
```

If `TESTPILOT_ENCRYPTION_KEY` is not set, credentials fall back to plaintext storage (documented limitation — production deployments should set the key).

## Data Flow

```
Provider Creation:
  UI → POST /api/ai/providers → Zod validation → workspace isolation check → save to aiProviders → audit log

Credential Setup:
  UI → POST /api/ai/providers/:id/credentials → encrypt with AES-256-GCM → store in credentialCache → mark configured

Connection Test:
  UI → POST /api/ai/providers/:id/test → DNS reachability → endpoint fetch → auth check → model list → valid response → record in providerConnectionTests + audit log

Health Check:
  UI → GET /api/ai/providers/:id/health → provider-specific health endpoint → record latency + status

Model Discovery:
  UI → POST /api/ai/models/discover → provider health endpoint (models list) → return verified models only → optional registry registration

Provider Call (Playground/Benchmark):
  UI → POST /api/ai/playground/chat → callProvider(config, messages) → decrypt key from cache → provider API call → return response + latency
```

## Security Properties

- **No credential exposure**: Credentials are never included in API responses, audit logs, or error messages
- **Workspace isolation**: Providers are scoped to a workspace; cross-workspace access returns 403
- **Role-based access**: Create/edit/delete/credentials require `admin`; read/test require `tester`; viewers can read only
- **CSRF protection**: All state-changing endpoints require valid CSRF token
- **Rate limiting**: API rate limiter applies to all provider endpoints
- **SSRF protection**: `assertSafeUrl` blocks private IP ranges (except localhost for local QA)
- **Encryption at rest**: AES-256-GCM when `TESTPILOT_ENCRYPTION_KEY` is set

## Backward Compatibility

- Phase 39 benchmark engine unchanged — still uses `currentTarget()` (env-var provider)
- `providerInfo()`, `generateCases()`, `analyseFailures()`, `askAssistant()` remain available
- Env-var based configuration (`AI_PROVIDER`, `OLLAMA_BASE_URL`, etc.) continues to work as the default
- No breaking changes to existing APIs

## Limitations

- Credential encryption requires `TESTPILOT_ENCRYPTION_KEY`; without it, credentials are stored in memory only
- Ollama/OpenAI-compatible providers are unconfigured in this environment — connection testing, playground, and discovery against them are blocked until credentials are provided
- Multi-model benchmark execution is designed for (model registry has `benchmarkEligible` flag) but the Phase 39 benchmark runner still uses `currentTarget()`; dynamic provider selection for benchmarks is a future phase
- Intelligent routing rules are stored and displayed but not yet enforced at the AI provider call level; `generateCases`, `analyseFailures`, `askAssistant` still use env-var routing
