# Multi-Model Benchmark Execution — Detailed Report

## Overview

Phase 41 extends the Phase 39 benchmark engine to support dynamic multi-model benchmark execution against providers registered in the Model Registry. This enables comparing multiple models/providers using identical test fixtures.

## Architecture

### Dynamic Target Discovery

```typescript
GET /api/benchmarks/targets
```

Returns eligible models from the Model Registry:
- `benchmarkEligible: true` (explicit opt-in)
- `enabled: true`
- Provider `enabled: true`

Response includes:
```typescript
{
  modelId: string
  providerId: string
  providerKind: 'ollama' | 'openai-compatible' | 'local'
  modelName: string
  modelIdentifier: string  // e.g., "llama3.1:8b" or "gpt-4o"
  configHash: string       // Hash of provider config + model params
}
```

### Provider-Aware Benchmark Engine

All 7 benchmark suites accept optional `providerConfig`:

```typescript
interface BenchmarkProviderConfig {
  providerId: string
  providerKind: 'ollama' | 'openai-compatible' | 'local'
  modelId: string
  modelName: string
  configHash: string
}
```

Modified suites:
- `runSuite1_CaseGeneration`
- `runSuite2_FailureTriage`
- `runSuite3_CoverageAnalysis`
- `runSuite4_HallucinationDetection`
- `runSuite5_LatencyMeasurement`
- `runSuite6_StressTest`
- `runSuite7_ModelComparison`

New orchestrator:
```typescript
runAllSuitesWithProvider(
  target: BenchmarkProviderConfig,
  providerConfig: BenchmarkProviderConfig,
  suiteIds?: string[]
): Promise<BenchmarkRun>
```

### Provider-Aware AI Wrappers

```typescript
generateCasesWithProvider(providerConfig, ...)
analyseFailuresWithProvider(providerConfig, ...)
askAssistantWithProvider(providerConfig, ...)
```

These bypass routing and use the specified provider directly.

## Execution Flow

```
1. User selects targets from /api/benchmarks/targets
2. User selects suite subset (or all)
3. POST /api/benchmarks/run/:providerId for each target
4. Server creates BenchmarkRun with provider-specific target info
5. Engine executes suites using provider-aware wrappers
6. Results stored in BenchmarkRun (append-only history)
7. Leaderboard and Compare views work across providers
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/benchmarks/targets` | List eligible models from registry |
| POST | `/api/benchmarks/run/:providerId` | Run benchmark against specific provider |

### Run Endpoint Body

```typescript
{
  workspaceId: string,
  target: BenchmarkProviderConfig,
  suiteIds?: string[]
}
```

### Response

```typescript
{
  runId: string
  status: 'running' | 'completed' | 'failed'
  target: BenchmarkProviderConfig
  results: BenchmarkSuiteResult[]
  configHash: string
}
```

## Phase 39 Guarantees Preserved

| Guarantee | Implementation |
|-----------|----------------|
| `configHash` isolation | Each run includes provider+model configHash; leaderboard only compares identical hashes |
| Append-only history | `BenchmarkRun` never modified after completion |
| Honest leaderboard | Only runs with matching `configHash` appear together |
| No score fabrication | Cloud providers unconfigured → no runs created, no scores invented |
| Deterministic fixtures | Same test cases used across all providers |

## Multi-Model Benchmark Runner UI

Page: `/app/ai/benchmark-runner`

Features:
- Target selection from dynamic registry discovery
- Suite selection (checkboxes for all 7 suites)
- Per-target execution with progress
- Results table with pass rate, latency, hallucination rate
- Links to run detail, history, leaderboard, compare

## Verification

### Unit Tests (`tests/ai-benchmark.test.ts`)

- Dynamic target discovery filters correctly
- Provider-aware execution uses correct provider
- configHash includes provider config
- Partial failure handling (one provider fails, others complete)
- Historical preservation (runs not overwritten)

### Live Verification

- Targets appear from Model Registry (local provider only in preview)
- Benchmark runs execute against selected provider
- Results appear in history with correct provider attribution
- Leaderboard shows only comparable runs (same configHash)
- CSV/JSON exports include provider/model metadata

## Limitations

1. **Single local provider in preview** — Only `testpilot-local-heuristics-v1` configured; cloud providers require user configuration
2. **No parallel execution** — Runs execute sequentially per provider (can run multiple providers in parallel via UI)
3. **No cost tracking** — Token usage not yet recorded per benchmark run
4. **No cancellation mid-suite** — Cancellation supported between suites only

## Future Enhancements

1. **Parallel multi-provider execution** — Run all selected targets concurrently
2. **Cost estimation** — Pre-run cost estimate based on token pricing
3. **Scheduled multi-model runs** — Automation Studio integration
4. **Model comparison dashboard** — Side-by-side metrics visualization
5. **Custom fixture injection** — User-provided test cases for benchmarking