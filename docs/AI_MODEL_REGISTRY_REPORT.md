# AI Model Registry Report (Phase 40)

## Overview

The AI Model Registry is a central catalog of AI models available to TESTPILOT AI workspaces. Each entry records capabilities that have been verified through testing or documentation — nothing is inferred or invented.

## Model Entry Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique model identifier (`model_<hex>`) |
| `workspaceId` | string | Owning workspace |
| `providerId` | string | References a configured provider |
| `name` | string | User-facing display name |
| `identifier` | string | Model identifier used in provider API calls |
| `type` | 'chat' \| 'completion' \| 'embedding' | Model interface type |
| `version` | string? | Model version, when verified |
| `contextWindow` | number? | Context window in tokens, only when verified |
| `capabilities` | string[] | Verified capabilities only |
| `inputFormats` | string[] | Supported input formats (e.g. `['text']`) |
| `outputFormats` | string[] | Supported output formats (e.g. `['text', 'json']`) |
| `toolCalling` | boolean | Verified tool-calling support |
| `streaming` | boolean | Verified streaming support |
| `enabled` | boolean | Whether the model is available for use |
| `benchmarkEligible` | boolean | Whether the model can be used as a benchmark target |
| `lastHealthCheck` | ProviderHealthResult? | Last health check result |
| `createdAt`, `updatedAt` | string | Timestamps |

## Model Discovery

Model discovery queries a configured provider's model listing endpoint:

- **Ollama**: `GET /api/tags` → returns `models[].name`
- **OpenAI-compatible**: `GET /models` → returns `data[].id`

Discovered models are registered with conservative, verified-only attributes:
- `type`: `'chat'`
- `capabilities`: `['text-generation']`
- `inputFormats`: `['text']`
- `outputFormats`: `['text']`
- `toolCalling`: `false`
- `streaming`: `false`
- `contextWindow`: not set (not discoverable from endpoint)

Discovery requires the provider to pass a health check first. If the provider is unhealthy, no models are discovered.

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/ai/models` | tester+ | List registered models for workspace |
| POST | `/api/ai/models` | admin+ | Register a new model |
| PATCH | `/api/ai/models/:id` | admin+ | Update model registry entry |
| POST | `/api/ai/models/discover` | admin+ | Discover models from a provider |

## Current State

In this environment, no LLM providers (Ollama / OpenAI-compatible) are configured. The local heuristics provider does not expose a model listing endpoint, so model discovery against it returns no models. The registry is empty until a provider is configured and models are discovered or manually registered.

## Verified Capabilities Policy

All capability fields (toolCalling, streaming, contextWindow, capabilities list) must be verified through:
1. Provider documentation, OR
2. Direct testing via the connection test or playground

Unverified capabilities are not claimed. Fields that cannot be verified are left unset or `false`.

## Storage

Model registry entries are stored in `Database.aiModels` and work with both JSON and SQLite storage adapters. Entries are never hard-deleted; they can be disabled (`enabled: false`) to preserve history.
