# AI Provider Testing Report (Phase 40)

## Overview

The provider connection testing workflow validates that a configured provider is actually reachable and functional before it is used for AI operations. A reachable endpoint does not automatically mean a model is working — each test dimension is checked independently.

## Connection Test Dimensions

| Dimension | What It Checks | How |
|---|---|---|
| DNS reachability | Hostname resolves and host is reachable | Fetch to base URL |
| Endpoint availability | Server responds to HTTP requests | Fetch to base URL, any status code accepted |
| Authentication | Provider accepts credentials | Health endpoint with auth header |
| Model availability | At least one model is listed | Health endpoint model list non-empty |
| Valid response | Chat completion returns content | Minimal chat request ("Hello") |
| Streaming supported | Provider supports streaming | Checked via provider type (local: false, cloud: not verified) |
| Structured output supported | Provider can return structured output | Checked via provider type (local: true, cloud: not verified) |
| Timeout handling | Request completes within configured timeout | `AbortSignal.timeout()` on all fetches |
| Rate-limit handling | HTTP 429 responses detected | Health endpoint status check |
| Error recovery | Errors are reported with explanation | Error messages captured and displayed |

## Test Results Model (`ProviderConnectionTest`)

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique test identifier |
| `providerId` | string | Provider tested |
| `testedAt` | string | ISO timestamp |
| `dnsReachable` | boolean | DNS/host reachable |
| `endpointAvailable` | boolean | Server responded |
| `authenticationOk` | boolean | Authentication accepted |
| `modelAvailable` | boolean | Models listed |
| `validResponse` | boolean | Chat completion returned content |
| `streamingSupported` | boolean | Streaming support |
| `structuredOutputSupported` | boolean | Structured output support |
| `timeoutMs` | number | Total test duration in ms |
| `error` | string? | Error description if any check failed |

## Health Check Model (`ProviderHealthResult`)

| Field | Type | Description |
|---|---|---|
| `providerId` | string | Provider checked |
| `status` | 'healthy' \| 'unhealthy' \| 'unknown' | Overall health |
| `checkedAt` | string | ISO timestamp |
| `latencyMs` | number? | Health check latency |
| `error` | string? | Error if unhealthy |
| `details` | object? | Provider-specific details (models list, etc.) |

## Provider-Specific Test Behavior

### Local Provider
- All checks pass instantly (no network call)
- `dnsReachable: true`, `endpointAvailable: true`, `authenticationOk: true`, `modelAvailable: true`, `validResponse: true`
- `streamingSupported: false`, `structuredOutputSupported: true`
- `timeoutMs`: ~0 ms

### Ollama
- Health: `GET /api/tags` — lists available models
- Connection test: fetch base URL, then `/api/tags`, then `/api/chat` with minimal message
- No authentication header (Ollama typically doesn't require one)

### OpenAI-compatible
- Health: `GET /models` — lists available models
- Connection test: fetch base URL, then `/models` with auth header, then `/chat/completions` with minimal message
- Requires API key in `Authorization: Bearer <key>` header

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/ai/providers/:id/test` | tester+ | Full connection test |
| GET | `/api/ai/providers/:id/health` | tester+ | Quick health check |

## Security

- Connection test requests do not log credential values
- Error messages are generic (no credential leakage)
- SSRF protection via `assertSafeUrl` (private IP ranges blocked, localhost allowed)
- API key is decrypted from secure cache only at call time

## Current State

No Ollama or OpenAI-compatible providers are configured in this environment. Connection testing against cloud providers is blocked until credentials are provided via the Provider Center. The local provider passes all connection test checks by design.

## Limitations

- Streaming and structured output support for cloud providers are not actually tested (marked based on provider type, not verified through live testing)
- Token usage is not measured (not available from these providers' APIs without additional instrumentation)
- Rate-limit handling is checked indirectly (health endpoint status) rather than through deliberate rate-limiting
