# AI Benchmark Comparison Report

**Consolidated results across all evaluated AI targets.** Date: 2026-11-12 · Benchmark configHash `4a2d19b8e172b0bb`.

**Honesty statement up front:** exactly **one target was evaluated** — the built-in local heuristics provider. Both optional LLM integrations (Ollama, OpenAI-compatible) exist in the code but are **not configured in this environment**, so they are marked **untested** and receive no score of any kind. **No overall winner is declared** — the system itself refuses to crown a winner with fewer than two evaluated targets, and so does this report.

---

## 1. Targets and status

| Target | Kind | Status | Evidence |
| --- | --- | --- | --- |
| `testpilot-local-heuristics-v1` | local rule engine | **Evaluated** — 7 suites, 39 fixture cases, multiple runs | Model report + live dashboard runs |
| `ollama` (default `llama3.2`) | local LLM | **Untested** — `OLLAMA_BASE_URL` not set; `AI_PROVIDER=local` | Provider layer reports it unconfigured; benchmark run endpoint returns 409 |
| `openai-compatible` | hosted LLM | **Untested** — credentials not set | Same 409 path; never scored |

## 2. Leaderboard (as served by `GET /api/ai/benchmarks/leaderboard`)

| # | Target | Score | Quality | Reliability | Robustness | Speed | Note |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | local | 100 | 100 | 100 | 100 | 100 | Latest completed run per target |

Score formula (weights disclosed in the API response and the methodology doc):

```
score = passRate×0.45 + reliability×0.20 + robustness×0.15 + latencyScore×0.20
reliability = consistency×0.5 + (100−errorRate)×0.3 + (100−malformedJson)×0.2
robustness  = (100−hallucinationRate)×0.8 + passRate×0.2
latencyScore = clamp(50·log10(1000/max(avgLatencyMs,1)) + 50, 0, 100)
```

`winnerDeclared: false` — the API returns an explicit note: *"Only one target has completed runs in this workspace — no overall winner is declared until at least two distinct targets have been evaluated."* This is the intended, honest behaviour, not a gap.

## 3. Category leaderboards — what can and cannot be claimed

| Category | Verdict | Reason |
| --- | --- | --- |
| Best overall / most reliable / fastest / lowest resource / best cost / best local-offline | **local, by default** — trivially | It is the only evaluated target; these would be vacuous titles, so the system does not declare them |
| Best reasoning / coding / mathematical / data-analysis / multilingual model | **Not declared** | No evaluated target performs inference; local provider is N/A on all of these |
| Best software-testing model | **local, within its measured scope** | It scored 100% on test-case generation, triage classification and structured output — but only against its own fixture scope |

## 4. Measured per-target summary

| Metric | local (measured) | ollama | openai-compatible |
| --- | ---: | --- | --- |
| Pass rate | 100% | untested | untested |
| Precision / Recall / F1 (triage) | 100 / 100 / 100 | untested | untested |
| Consistency | 100% | untested | untested |
| Hallucination rate | 0% | untested | untested |
| Injection resistance | 100% | untested | untested |
| Malformed JSON rate | 0% | untested | untested |
| Avg latency | ~0.1 ms (sub-ms) | untested | untested |
| P95 latency | 0.5–0.7 ms | untested | untested |
| RAM Δ / CPU Δ during run | −634 KB / 0 ms | untested | untested |
| Tokens/sec, cost per token | N/A (no tokenisation) | N/A (not run) | N/A (not run) |

## 5. Improvement experiment record

One controlled improvement was executed on the local provider — **output-format hardening + parser disambiguation (not training)**:

| Metric | Before | After | Δ |
| --- | ---: | ---: | ---: |
| Pass rate | 97.2% | 100% | +2.8 |
| Hallucination rate | 4.8% | 0% | −4.8 |
| Hallucination-suite pass | 50% | 100% | +50 |
| Error rate | 0% | 0% | 0 |
| Avg latency | 0.1 ms | 0.1 ms | 0 |
| CPU Δ | 15 ms | 0 ms | −15 ms |
| Cost per successful task | 0 | 0 | 0 |

Sample sizes and conditions: 39 fixture cases, same fixtures/hash for both runs, append-only history preserving both records. No fine-tuning, LoRA, or supervised training occurred — none is supported by the local provider (it has no weights). See [AI_MODEL_REPORT_LOCAL_PROVIDER.md](AI_MODEL_REPORT_LOCAL_PROVIDER.md).

## 6. Recommendations

1. **Keep local as the default and fallback.** It is measured-correct within scope, free and instant.
2. **To enable true comparison:** configure Ollama (`AI_PROVIDER=ollama`, `OLLAMA_BASE_URL`) on any machine with ≥8 GB free RAM, then run the benchmark — the leaderboard will immediately support a two-target comparison and a declared winner with real evidence.
3. **Re-run the suites after any provider output-format change**; the compare endpoint refuses mismatched configHash runs, so fixture changes force an explicit re-baseline.
4. **Do not add score categories without a measuring suite.** Everything not measurable is shown as N/A rather than guessed.

## 7. Limitations of this comparison

- Single evaluated target — comparisons across providers are impossible here, and are explicitly not fabricated.
- Cloud latencies (when configured) include network time and are not directly comparable to sub-millisecond local latencies.
- Resource metrics are whole-process (Node.js), not sandboxed per-model.
- Benchmark scope covers the product's AI surface (generation, triage, assistant, security, resilience) — it is not a general-purpose LLM benchmark, by design.
