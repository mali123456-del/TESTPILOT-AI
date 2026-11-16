# AI Routing Engine — Detailed Report

## Overview

The AI Routing Engine is the core of intelligent provider selection in TESTPILOT AI. It resolves which AI provider should handle a given task based on configurable routing rules, provider health, and fallback policies.

## Architecture

### Core Resolution Function

```typescript
async function resolveProvider(
  workspaceId: string,
  taskCategory: string
): Promise<ResolvedProvider>
```

**Resolution priority:**
1. **Task-specific routing rule** — Match `taskCategory` against `AiRoutingRule` entries
2. **Default provider** — `aiRoutingConfig.defaultProviderId` if set
3. **Environment variable** — `TESTPILOT_AI_PROVIDER` (legacy fallback)
4. **Local provider** — Built-in heuristic provider (always available)

### Routing Decision Factors

| Factor | Source | Weight |
|--------|--------|--------|
| Task category match | `AiRoutingRule.taskCategory` | Highest |
| Provider enabled | `AiProviderConfig.enabled` | Required |
| Provider healthy | `ProviderHealthCheck` | Required |
| Fallback chain | `AiRoutingRule.fallbackProviderIds` | Sequential |
| Timeout | `AiRoutingRule.timeoutMs` / config default | Per-call |
| Retries | `AiRoutingRule.maxRetries` / config default | Per-call |

### Fallback Behavior

When a provider fails (timeout, error, unhealthy):
1. Log decision with `usedFallback: true`
2. Select next provider from `fallbackProviderIds`
3. Retry up to `maxRetries` times per provider
4. If all fail, return error with full decision trail

## Routing-Aware Wrappers

All three core AI operations now route through the engine:

```typescript
// Case generation
generateCasesWithRouting(workspaceId, taskCategory, prompt, options)

// Failure triage
analyseFailuresWithRouting(workspaceId, taskCategory, failures, options)

// Assistant queries
askAssistantWithRouting(workspaceId, taskCategory, question, context, options)
```

Each wrapper:
- Calls `resolveProvider()` for provider selection
- Executes with timeout/retry logic
- Logs `AiRoutingDecision` with latency, success, fallback info
- Returns result or throws with decision context

## Routing Decision Logging

```typescript
interface AiRoutingDecision {
  id: string
  workspaceId: string
  timestamp: number
  taskCategory: string
  requestedProviderId?: string
  resolvedProviderId: string
  fallbackProviderIds: string[]
  usedFallback: boolean
  latencyMs: number
  success: boolean
  error?: string
  reason: string // e.g., "matched rule", "default provider", "fallback after failure"
}
```

- Capped at 1000 entries per workspace (FIFO eviction)
- Append-only, never modified after creation
- Queryable via `GET /api/ai/routing/decisions`

## Configuration

### Routing Rules (`AiRoutingRule`)

```typescript
{
  id: string
  taskCategory: string        // "case-generation" | "failure-triage" | "assistant" | "benchmark"
  primaryProviderId: string
  fallbackProviderIds: string[]
  timeoutMs?: number          // override default
  maxRetries?: number         // override default
  enabled: boolean
}
```

### Default Configuration

```typescript
interface AiRoutingConfig {
  defaultProviderId?: string
  rules: AiRoutingRule[]
  defaultTimeoutMs: number    // 30000
  defaultMaxRetries: number   // 2
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/routing` | Get routing config |
| PUT | `/api/ai/routing` | Update routing config |
| GET | `/api/ai/routing/decisions` | List routing decisions (paginated) |

## Verification

### Unit Tests (`tests/ai-benchmark.test.ts`)

- Routing rule matching by task category
- Fallback chain execution on primary failure
- Timeout enforcement
- Retry counting
- Decision logging accuracy

### Live Verification

- Routing Rules Manager UI creates/edits/deletes rules
- Routing Dashboard shows recent decisions with latency/success
- Playground and benchmark execution respect routing rules
- Fallback verified by simulating provider failure

## Security

- All endpoints require `ai:read` or `ai:write` RBAC permissions
- Workspace isolation enforced
- No credentials in decision logs
- Decision history capped to prevent unbounded growth

## Future Enhancements

1. **Cost-aware routing** — Select provider by estimated cost per task
2. **Latency-based routing** — Prefer faster providers for interactive tasks
3. **Capability matching** — Route based on model capabilities (vision, tools, etc.)
4. **A/B testing** — Percentage-based traffic splitting between providers