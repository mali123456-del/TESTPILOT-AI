# Model Report — TESTPILOT Local Heuristics Provider

**Model identifier:** `testpilot-local-heuristics-v1` (`AI_PROVIDER=local`)
**Provider type:** internal deterministic rule engine (no LLM inference)
**Report date:** 2026-11-12 · **Benchmark version:** configHash `4a2d19b8e172b0bb`
**Methodology:** [AI_BENCHMARK_METHODOLOGY.md](AI_BENCHMARK_METHODOLOGY.md)

---

## 1. What this model actually is

A deterministic, offline rule engine embedded in `server/ai/provider.ts`:

| Sub-system | Mechanism |
| --- | --- |
| `generateCases` | 10 case templates routed by regex area matching (authentication, payments, search, file upload, API, forms, notifications, …) |
| `analyseFailures` | Bucket classification of failure messages into 8 cause categories with evidence lines and recommendations |
| `askAssistant` | Keyword-intent routing over live workspace metrics with a deterministic fallback answer |

It performs **no statistical inference**: identical inputs always produce identical outputs. Capabilities that require inference (reasoning, mathematics, long context, multilingual, tool calling, RAG, token accounting) are **N/A for this model**, and the dashboard displays them as N/A — never as 0%.

## 2. Test conditions

- 7 benchmark suites, 39 fixture cases total, executed through the exact product entry points
- Sample sizes: 8 generation calls, 1 triage batch (14 fixtures), 5 assistant probes, 3 consistency repeats, 4 hallucination-guard fixtures, 2 injection probes, 4 resilience probes
- Hardware: Intel Core i5-4200U, 8 GB RAM, Node.js process, Windows 10 Pro
- All numbers below are measured; nothing is estimated.

## 3. Measured results (current build, post-hardening)

| Metric | Value | Basis |
| --- | ---: | --- |
| Overall pass rate | **100%** | 39/39 fixture cases |
| Accuracy (assistant intent) | 100% | 5/5 intent probes |
| Precision (triage, micro-avg) | 100% | 14 labelled fixtures |
| Recall (triage, micro-avg) | 100% | 14 labelled fixtures |
| F1 (triage, micro-avg) | 100% | per-category F1 also 100 for all 8 causes |
| Exact-match (area routing) | 100% | 7/7 in-scope generation fixtures |
| Structured output rate | 100% | 8/8 generation fixtures |
| Instruction following (count compliance) | 100% | 8/8 requested counts met |
| Consistency (determinism) | 100% | 3/3 identical repeats |
| Hallucination rate | **0%** | 4/4 quoted titles from input, coverage 100% |
| Prompt-injection resistance | 100% | 2/2 probes resisted |
| Recovery rate (degenerate inputs) | 100% | 4/4 boundary probes handled |

### Per-suite latency (real measurements)

| Suite | Avg | Median | P95 | P99 | Samples |
| --- | ---: | ---: | ---: | ---: | ---: |
| generation-structure | 0.1–0.2 ms | 0.1 ms | 0.5–0.7 ms | 0.5–0.7 ms | 8 |
| triage-accuracy | 0.7 ms | 0.7 ms | 0.7 ms | 0.7 ms | 1 (batch of 14) |
| assistant-routing | < 0.5 ms | — | — | — | 5 |
| consistency | < 0.5 ms | — | — | — | 3 |

**Tokens per second / tokens consumed / cost per token: N/A** — the rule engine performs no tokenisation and no metered inference. Cost per 1,000 successful tasks: effectively zero compute cost beyond process time (no API charges).

### Resource consumption

| Metric | Value | Note |
| --- | ---: | --- |
| RAM Δ (heap) | −634 KB | Whole-process measurement during the run; workload fits existing heap |
| CPU Δ | 0 ms | Sub-tick — the engine is cheaper than the process CPU clock resolution |
| Model size | ~14 KB source (`server/ai/provider.ts`) | No weights — it is code, not a model |
| GPU/VRAM | N/A | No GPU usage by design |
| Storage | 0 (no artifacts written) | Benchmark runs are stored as JSON records only |

### Errors and reliability

- Total errors: 0 · failed requests: 0 · timeout rate: 0% · malformed JSON rate: 0%
- Tool-calling failure rate: N/A (no tool-call layer exists)
- Retry rate: 0% (local provider has no retry path; cloud fallback does, untested here)
- Recovery success rate: 100% (boundary inputs handled without throws)

## 4. Weakness found and fixed (honest improvement — NOT training)

**Baseline (pre-fix) run measured:**

| Metric | Before | After | Δ |
| --- | ---: | ---: | ---: |
| Overall pass rate | 97.2% | 100% | +2.8 |
| Hallucination rate | 4.8% | 0% | −4.8 |
| Hallucination-suite pass rate | 50% | 100% | +50 |
| Triage F1 / consistency / injection / generation | 100% | 100% | unchanged (no regression) |
| Avg latency | 0.1 ms | 0.1 ms | unchanged |
| CPU Δ | 15 ms | 0 ms | −15 ms |
| RAM Δ | −721 KB | −634 KB | noise-level (heap measurement) |

**Root cause:** the triage output's indented recommendation lines (`  - Recommended: …`) were structurally identical to its failure-evidence bullets (`- Title: message`). Any consumer parsing top-level bullet lines — including the benchmark parser and downstream UI consumers — miscounted recommendations as quoted case titles, inflating the hallucination rate to 33.3% invented titles on the hallucination-guard suite.

**Fix (labelled accurately):** *output-format hardening + benchmark parser disambiguation* — not model training. The provider now emits recommendations as `  ↳ Recommended:` and the parser counts top-level bullets only. Provider terms unchanged; no weights exist to overwrite.

**Verification:** same suites, same fixtures, same configHash; no regression on any other metric. Both pre-fix and post-fix runs are preserved in the append-only history in the preview workspace (`bench_73afc2eaadd24c826b`, `bench_6d475d035fc297ea0f` and a live UI run; post-fix runs all record passRate 100%, hallucination 0%).

## 5. Strengths and weaknesses

**Strengths**
- Fully deterministic and offline; zero-dependency; instant (sub-millisecond) responses
- Perfectly consistent; cannot hallucinate beyond the fixed template set (verified at 0%)
- Well-structured output by construction (100% structured-output rate)

**Weaknesses (real, not hidden)**
- Zero inference capability: it can only produce what its templates cover; genuinely novel requirements fall to the generic fallback (intentionally exercised by the `gen-unknown` fixture)
- Area routing depends on the regex keyword list; new domains require code changes
- Cannot reason about failure evidence beyond the 8 built-in cause buckets

## 6. Untested / N/A capabilities

General reasoning · mathematics · coding · long-context · multilingual · data analysis · knowledge retrieval (RAG) · tool calling · token throughput · cost per token — **N/A**: this model performs no inference and has no token accounting. These categories become measurable only if an LLM provider (Ollama / OpenAI-compatible) is configured.

## 7. Final recommendation

**Retain as the default provider.** It is correct on every measurable dimension for its designed scope, free, instant, and offline. It should remain the fallback for cloud providers, and the hallucination-guard + injection-resistance suites should be re-run whenever the provider's output format changes. Configuring Ollama would enable a genuine second leaderboard entry — cloud-vs-local comparison is not possible in this environment and is not pretended.
