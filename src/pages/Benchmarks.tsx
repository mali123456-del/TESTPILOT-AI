import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FlaskConical,
  History,
  Info,
  Play,
  RefreshCw,
  Scale,
  Trophy,
  XCircle,
} from 'lucide-react';
import type { BenchmarkLeaderboardEntry, BenchmarkRun } from '../../shared/types';
import { api, getCsrf, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, PageHead } from '../components/ui';

interface SuiteDef {
  id: string;
  name: string;
  capability: string;
  description: string;
  measures: string[];
}

interface InventoryProvider {
  active: { name: string; model: string | null; available: boolean };
  options: string[];
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  description: string;
  runs: number;
  requiresApproval: boolean;
}

interface Leaderboard {
  entries: BenchmarkLeaderboardEntry[];
  weights: Record<string, number>;
  formula: string;
  winnerDeclared: boolean;
  note?: string;
}

interface CompareResult {
  a: { id: string; startedAt: string; target: { kind: string; model: string | null } };
  b: { id: string; startedAt: string; target: { kind: string; model: string | null } };
  overall: Record<string, { a: number; b: number; delta: number }>;
  suites: Array<{
    suiteId: string;
    name: string;
    latencyA: number;
    latencyB: number | null;
    metrics: Record<string, { a: number; b: number; delta: number }>;
  }>;
  regression: boolean;
}

const TABS = ['Inventory', 'Suites', 'Run & results', 'History', 'Leaderboard', 'Compare'] as const;
type Tab = (typeof TABS)[number];

export default function Benchmarks() {
  const { auth } = useAuth();
  const canRun = auth?.user.role !== 'viewer';
  const [tab, setTab] = useState<Tab>('Inventory');
  const inventory = useResource<InventoryProvider>('/ai/providers');
  const agents = useResource<AgentRow[]>('/ai/agents');
  const suites = useResource<SuiteDef[]>('/ai/benchmarks/suites');
  const history = useResource<{ items: BenchmarkRun[]; total: number }>(`/ai/benchmarks/runs?pageSize=50`);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSuiteIds, setSelectedSuiteIds] = useState<string[]>([]);
  const [lastRun, setLastRun] = useState<BenchmarkRun | null>(null);
  const [detail, setDetail] = useState<BenchmarkRun | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [compareSel, setCompareSel] = useState({ a: '', b: '' });

  const loadLeaderboard = useCallback(() => {
    api<Leaderboard>('/ai/benchmarks/leaderboard').then(setLeaderboard).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    if (history.data && !selectedSuiteIds.length) {
      setSelectedSuiteIds((suites.data ?? []).map((s) => s.id));
    }
  }, [suites.data, history.data, selectedSuiteIds.length]);

  const runBenchmark = async () => {
    setRunning(true);
    setNotice(null);
    setError(null);
    try {
      const run = await api<BenchmarkRun>('/ai/benchmarks/run', {
        method: 'POST',
        body: { suiteIds: selectedSuiteIds, label: 'Manual run from dashboard' },
      });
      setLastRun(run);
      setTab('Run & results');
      setNotice(`Benchmark ${run.id.slice(0, 12)} completed: pass rate ${run.overall.passRate}%.`);
      history.reload();
      loadLeaderboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Benchmark failed');
    } finally {
      setRunning(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetail(null);
    try {
      setDetail(await api<BenchmarkRun>(`/ai/benchmarks/runs/${id}`));
      setTab('Run & results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load benchmark run');
    }
  };

  const exportRun = async (id: string, format: 'json' | 'csv') => {
    try {
      const res = await fetch(`/api/ai/benchmarks/runs/${id}/export?format=${format}`, {
        headers: getCsrf() ? { 'x-csrf-token': getCsrf() } : undefined,
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const runCompare = async () => {
    setCompare(null);
    if (!compareSel.a || !compareSel.b) {
      setError('Pick two benchmark runs to compare.');
      return;
    }
    try {
      setCompare(await api<CompareResult>('/ai/benchmarks/compare', { method: 'POST', body: compareSel }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    }
  };

  const shownRun = lastRun ?? detail;
  const runsForCompare = history.data?.items ?? [];

  return (
    <>
      <PageHead
        title="AI benchmarking"
        sub="Reproducible, fixture-driven evaluation of the AI layer — real measurements only, untested capabilities marked N/A."
        actions={
          <>
            <button className="btn" onClick={() => { history.reload(); loadLeaderboard(); }}><RefreshCw size={14} /> Refresh</button>
            {canRun && (
              <button className="btn btn-primary" disabled={running || !selectedSuiteIds.length} onClick={() => void runBenchmark()}>
                <FlaskConical size={14} /> {running ? 'Running…' : 'Run benchmark'}
              </button>
            )}
          </>
        }
      />

      {notice && <div className="badge badge-good" style={{ padding: 8, marginBottom: 12, display: 'block' }}><CheckCircle2 size={12} /> {notice}</div>}
      {error && <div className="badge badge-bad" style={{ padding: 8, marginBottom: 12, display: 'block' }}><AlertTriangle size={12} /> {error}</div>}

      <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Inventory' && <InventoryTab inventory={inventory} agents={agents} />}
      {tab === 'Suites' && <SuitesTab suites={suites} />}
      {tab === 'Run & results' && (
        <RunTab
          suites={suites.data ?? []}
          selected={selectedSuiteIds}
          setSelected={setSelectedSuiteIds}
          canRun={canRun}
          running={running}
          onRun={() => void runBenchmark()}
          run={shownRun}
          onExport={(f) => shownRun && void exportRun(shownRun.id, f)}
        />
      )}
      {tab === 'History' && (
        <HistoryTab
          runs={runsForCompare}
          total={history.data?.total ?? 0}
          loading={history.loading && !history.data}
          onOpen={openDetail}
          onExport={exportRun}
        />
      )}
      {tab === 'Leaderboard' && <LeaderboardTab board={leaderboard} />}
      {tab === 'Compare' && (
        <CompareTab
          runs={runsForCompare}
          sel={compareSel}
          setSel={setCompareSel}
          onCompare={() => void runCompare()}
          result={compare}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ tabs */

function InventoryTab({ inventory, agents }: { inventory: { data: InventoryProvider | null; loading: boolean; error: string | null }; agents: { data: AgentRow[] | null } }) {
  if (inventory.loading && !inventory.data) return <Loading rows={6} />;
  if (inventory.error) return <EmptyState title="Inventory unavailable" desc={inventory.error} />;
  const active = inventory.data?.active;
  const configured = active?.name ?? 'local';

  const providers = [
    {
      kind: 'local',
      model: 'testpilot-local-heuristics-v1',
      status: 'available',
      detail: 'Deterministic rule engine: template case generation, regex area routing, bucket failure triage, keyword-intent assistant. Offline by default.',
    },
    {
      kind: 'ollama',
      model: 'OLLAMA_MODEL or llama3.2 default',
      status: configured === 'ollama' ? 'configured' : 'unavailable',
      detail: 'Optional local LLM via Ollama /api/chat. Not configured in this environment (AI_PROVIDER is not "ollama" or no OLLAMA_BASE_URL) — untested.',
    },
    {
      kind: 'openai-compatible',
      model: 'OPENAI_COMPATIBLE_MODEL or unset',
      status: configured === 'openai-compatible' ? 'configured' : 'unavailable',
      detail: 'Optional hosted LLM via /chat/completions. Not configured in this environment — untested.',
    },
  ];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card>
        <CardHead title="AI model inventory" desc="Providers wired into the product, with live availability from the provider layer" />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Provider</th><th>Model</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.kind}>
                  <td className="small"><strong>{p.kind}</strong>{p.kind === configured && <span className="badge badge-info" style={{ marginLeft: 8 }}>active</span>}</td>
                  <td className="small mono">{p.model}</td>
                  <td><Badge status={p.status} /></td>
                  <td className="small faint">{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-body small faint" style={{ borderTop: '1px solid var(--border)' }}>
          Routing: cloud-first with silent fallback to the local provider on error or unparseable reply. No streaming, no function calling, no embeddings/RAG, no fine-tuning infrastructure — those are marked N/A, not faked.
        </div>
      </Card>

      <Card>
        <CardHead title="AI call sites" desc="Where the AI layer is invoked in the product" />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Function</th><th>Entry points</th><th>Behaviour</th></tr></thead>
            <tbody>
              <tr><td className="small mono">generateCases</td><td className="small">/ai/generate-cases, case-generator &amp; api-agent agents</td><td className="small faint">requirement → structured test-case drafts</td></tr>
              <tr><td className="small mono">analyseFailures</td><td className="small">/ai/analyze-run, orchestrator auto-triage, debugger agent, bug drafts</td><td className="small faint">failure list → cause buckets + recommendations</td></tr>
              <tr><td className="small mono">askAssistant</td><td className="small">/ai/chat</td><td className="small faint">question + workspace context → answer</td></tr>
              <tr><td className="small mono">/ai/duplicates</td><td className="small">Assistant page</td><td className="small faint">Jaccard similarity over case titles (local, deterministic)</td></tr>
              <tr><td className="small mono">/ai/plan</td><td className="small">Assistant page</td><td className="small faint">deterministic risk-based test plan from live metrics</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Agent workforce" desc={`${agents.data?.length ?? 0} defined agents — rule-based, approval-gated`} />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Agent</th><th>Role</th><th>Approval</th><th>Runs</th></tr></thead>
            <tbody>
              {(agents.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="small">{a.name}</td>
                  <td className="small faint">{a.role}</td>
                  <td><Badge status={a.requiresApproval ? 'awaiting_approval' : 'active'}>{a.requiresApproval ? 'required' : 'not required'}</Badge></td>
                  <td className="small">{a.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Capability coverage (honest matrix)" desc="What the benchmark suites measure vs. what is not applicable" />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Category</th><th>Local provider</th><th>LLM providers (unconfigured)</th></tr></thead>
            <tbody>
              {[
                ['Test-case generation quality', 'Measured', 'Measurable when configured'],
                ['Failure classification (P/R/F1)', 'Measured', 'Measurable when configured'],
                ['Structured JSON output', 'Measured (by construction)', 'Measured (parse rate)'],
                ['Response consistency', 'Measured', 'Measured'],
                ['Hallucination resistance', 'Measured', 'Measured'],
                ['Prompt-injection resistance', 'Measured', 'Measured'],
                ['Error handling / recovery', 'Measured', 'Measured'],
                ['General reasoning / mathematics', 'N/A — deterministic rule engine, no inference', 'Requires configured LLM'],
                ['Long-context performance', 'N/A — inputs bounded by design', 'Requires configured LLM'],
                ['Multilingual', 'N/A', 'Requires configured LLM'],
                ['Tool calling / function execution', 'N/A — no tool-call layer exists', 'Not implemented in the integration'],
                ['RAG / knowledge retrieval', 'N/A — no retrieval layer exists', 'Not implemented'],
                ['Tokens per second / cost per token', 'N/A — no token accounting', 'Provider-dependent, when configured'],
              ].map(([cat, local, cloud]) => (
                <tr key={cat}>
                  <td className="small">{cat}</td>
                  <td className="small">{local.startsWith('N/A') ? <span className="faint">{local}</span> : <Badge status="passed">{local}</Badge>}</td>
                  <td className="small faint">{cloud}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SuitesTab({ suites }: { suites: { data: SuiteDef[] | null; loading: boolean; error: string | null } }) {
  if (suites.loading && !suites.data) return <Loading rows={5} />;
  if (suites.error) return <EmptyState title="Suites unavailable" desc={suites.error} />;
  return (
    <Card>
      <CardHead title="Benchmark test suites" desc="Fixture-based, versioned via configHash for reproducible regression checks" />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Suite</th><th>Capability</th><th>Measures</th><th>Description</th></tr></thead>
          <tbody>
            {(suites.data ?? []).map((s) => (
              <tr key={s.id}>
                <td className="small"><strong>{s.name}</strong><div className="faint mono" style={{ fontSize: 10 }}>{s.id}</div></td>
                <td className="small faint">{s.capability}</td>
                <td className="small">{s.measures.map((m) => <span key={m} className="badge" style={{ margin: 2 }}>{m}</span>)}</td>
                <td className="small faint">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RunTab({
  suites,
  selected,
  setSelected,
  canRun,
  running,
  onRun,
  run,
  onExport,
}: {
  suites: SuiteDef[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  canRun: boolean;
  running: boolean;
  onRun: () => void;
  run: BenchmarkRun | null;
  onExport: (format: 'json' | 'csv') => void;
}) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card>
        <CardHead
          title="Live benchmark execution"
          desc="Runs the selected suites against the active AI provider and records the result in history (append-only)."
          action={canRun ? undefined : <Badge status="pending">viewers cannot run benchmarks</Badge>}
        />
        <div className="card-body stack" style={{ gap: 12 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(suites.map((s) => s.id))}>Select all</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected([])}>Clear</button>
            <div className="spacer" />
            {canRun && <button className="btn btn-primary btn-sm" disabled={running || !selected.length} onClick={onRun}><Play size={13} /> {running ? 'Running…' : `Run ${selected.length} suite(s)`}</button>}
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            {suites.map((s) => (
              <label key={s.id} className="list-row" style={{ cursor: 'pointer', padding: '7px 12px' }}>
                <input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))} />
                <span className="small" style={{ flex: 1 }}>{s.name}</span>
                <span className="badge">{s.capability.split(' /')[0]}</span>
              </label>
            ))}
          </div>
        </div>
      </Card>

      {run ? <RunDetail run={run} onExport={onExport} /> : (
        <Card>
          <EmptyState icon={<FlaskConical size={18} />} title="No benchmark result shown" desc="Run the suites or open a run from History." />
        </Card>
      )}
    </div>
  );
}

function RunDetail({ run, onExport }: { run: BenchmarkRun; onExport: (format: 'json' | 'csv') => void }) {
  return (
    <Card>
      <CardHead
        title={`Run ${run.id.slice(0, 13)}`}
        desc={`${run.target.kind}${run.target.model ? ` · ${run.target.model}` : ''} · config ${run.configHash} · ${when(run.startedAt)}`}
        action={
          <div className="row" style={{ gap: 6 }}>
            <Badge status={run.status === 'completed' ? 'passed' : run.status === 'failed' ? 'failed' : 'running'} />
            <button className="btn btn-sm btn-ghost" onClick={() => onExport('json')}><Download size={12} /> JSON</button>
            <button className="btn btn-sm btn-ghost" onClick={() => onExport('csv')}><Download size={12} /> CSV</button>
          </div>
        }
      />
      <div className="card-body stack" style={{ gap: 14 }}>
        {run.status !== 'completed' ? (
          <div className="badge badge-bad" style={{ padding: 8 }}><AlertTriangle size={12} /> This run {run.status === 'failed' ? 'failed' : 'did not finish'} — see notes below.</div>
        ) : (
          <>
            <div className="grid grid-4" style={{ gap: 10 }}>
              <Stat label="Pass rate" value={`${run.overall.passRate}%`} />
              <Stat label="Avg latency" value={`${run.overall.avgLatencyMs} ms`} />
              <Stat label="Error rate" value={`${run.overall.errorRate}%`} />
              <Stat label="Consistency" value={`${run.overall.consistency}%`} />
            </div>
            <div className="row small faint" style={{ gap: 16, flexWrap: 'wrap' }}>
              <span>Hallucination rate: {run.overall.hallucinationRate}%</span>
              <span>Malformed reply rate: {run.overall.malformedJsonRate}%</span>
              <span>RAM Δ: {run.resource.ramDeltaKb ?? 'N/A'} KB</span>
              <span>CPU Δ: {run.resource.cpuDeltaMs ?? 'N/A'} ms</span>
              <span>Wall: {run.durationMs ?? 'N/A'} ms</span>
            </div>
          </>
        )}

        {run.suites.map((s) => (
          <div key={s.suiteId} style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
            <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
              <strong className="small">{s.name}</strong>
              <span className="faint small">{s.capability}</span>
              <div className="spacer" />
              <span className="small faint">p95 {s.latency.p95Ms} ms · {s.latency.samples} sample(s)</span>
              {s.errors > 0 && <Badge status="failed">{s.errors} error(s)</Badge>}
            </div>
            <div className="card-body stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(s.metrics).map(([k, v]) => (
                  <span key={k} className="badge" title={`${k}: ${v}%`}>{k.replace(/_/g, ' ')}: {v}%</span>
                ))}
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Case</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead>
                  <tbody>
                    {s.cases.map((c) => (
                      <tr key={c.id}>
                        <td className="small">{c.name}</td>
                        <td className="small faint">{c.expected}</td>
                        <td className="small">{c.actual}</td>
                        <td>{c.passed ? <CheckCircle2 size={14} style={{ color: 'var(--good)' }} /> : <XCircle size={14} style={{ color: 'var(--bad)' }} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}

        {run.notes.length > 0 && (
          <details>
            <summary className="small muted" style={{ cursor: 'pointer' }}>Methodology notes ({run.notes.length})</summary>
            <ul className="small faint" style={{ margin: '8px 0 0 18px' }}>
              {run.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function HistoryTab({
  runs,
  total,
  loading,
  onOpen,
  onExport,
}: {
  runs: BenchmarkRun[];
  total: number;
  loading: boolean;
  onOpen: (id: string) => void;
  onExport: (id: string, format: 'json' | 'csv') => void;
}) {
  if (loading) return <Loading rows={6} />;
  if (!runs.length) return <Card><EmptyState icon={<History size={18} />} title="No benchmark history" desc="Run a benchmark to create the first record. History is append-only." /></Card>;
  return (
    <Card>
      <CardHead title="Benchmark history" desc={`${total} recorded run(s) — records are never overwritten`} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Run</th><th>Target</th><th>Status</th><th>Pass rate</th><th>Avg latency</th><th>Config</th><th>When</th><th></th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} style={{ cursor: 'pointer' }}>
                <td className="mono small">{r.id.slice(0, 13)}</td>
                <td className="small">{r.target.kind}{r.target.model ? <div className="faint" style={{ fontSize: 10 }}>{r.target.model}</div> : null}</td>
                <td><Badge status={r.status === 'completed' ? 'passed' : r.status === 'failed' ? 'failed' : 'running'} /></td>
                <td className="small">{r.status === 'completed' ? `${r.overall.passRate}%` : '—'}</td>
                <td className="small">{r.status === 'completed' ? `${r.overall.avgLatencyMs} ms` : '—'}</td>
                <td className="small faint mono">{r.configHash}</td>
                <td className="small faint">{when(r.startedAt)}</td>
                <td className="small nowrap">
                  <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onExport(r.id, 'json'); }}>JSON</button>
                  <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onExport(r.id, 'csv'); }}>CSV</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LeaderboardTab({ board }: { board: Leaderboard | null }) {
  if (!board) return <Loading rows={4} />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      {!board.winnerDeclared && (
        <div className="badge badge-info" style={{ padding: 10 }}><Info size={12} /> {board.note}</div>
      )}
      <Card>
        <CardHead title="Model leaderboard" desc="Latest completed run per target; formula and weights disclosed" />
        <div className="card-body small faint" style={{ borderBottom: '1px solid var(--border)' }}>
          {board.formula} — weights: {Object.entries(board.weights).map(([k, v]) => `${k} ${v}`).join(', ')}.
        </div>
        {board.entries.length === 0 ? (
          <EmptyState icon={<Trophy size={18} />} title="No completed benchmark runs" desc="Run a benchmark to populate the leaderboard." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Target</th><th>Score</th><th>Quality</th><th>Reliability</th><th>Robustness</th><th>Speed</th><th>Evaluated</th></tr></thead>
              <tbody>
                {board.entries.map((e, i) => (
                  <tr key={e.runId}>
                    <td className="small">{i + 1}</td>
                    <td className="small"><strong>{e.target.kind}</strong><div className="faint mono" style={{ fontSize: 10 }}>{e.target.model ?? 'unconfigured'}</div></td>
                    <td className="small"><strong style={{ fontSize: 15 }}>{e.score}</strong></td>
                    <td className="small">{e.parts.quality}</td>
                    <td className="small">{e.parts.reliability}</td>
                    <td className="small">{e.parts.robustness}</td>
                    <td className="small">{e.parts.speed}</td>
                    <td className="small faint">{when(e.evaluatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CompareTab({
  runs,
  sel,
  setSel,
  onCompare,
  result,
}: {
  runs: BenchmarkRun[];
  sel: { a: string; b: string };
  setSel: (v: { a: string; b: string }) => void;
  onCompare: () => void;
  result: CompareResult | null;
}) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card>
        <CardHead title="Before / after comparison" desc="Only runs sharing the same configHash are comparable — this prevents false regressions from fixture changes" />
        <div className="card-body">
          <div className="grid grid-2" style={{ gap: 12 }}>
            <Field label="Baseline (before)">
              <select className="select" value={sel.a} onChange={(e) => setSel({ ...sel, a: e.target.value })}>
                <option value="">Select a run…</option>
                {runs.map((r) => <option key={r.id} value={r.id}>{r.id.slice(0, 13)} · {r.target.kind} · {when(r.startedAt)}</option>)}
              </select>
            </Field>
            <Field label="Candidate (after)">
              <select className="select" value={sel.b} onChange={(e) => setSel({ ...sel, b: e.target.value })}>
                <option value="">Select a run…</option>
                {runs.map((r) => <option key={r.id} value={r.id}>{r.id.slice(0, 13)} · {r.target.kind} · {when(r.startedAt)}</option>)}
              </select>
            </Field>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onCompare} style={{ marginTop: 10 }}><Scale size={13} /> Compare</button>
        </div>
      </Card>

      {result && (
        <Card>
          <CardHead
            title="Comparison result"
            desc={`${result.a.target.kind} → ${result.b.target.kind}`}
            action={result.regression ? <Badge status="failed">pass-rate regression</Badge> : <Badge status="passed">no pass-rate regression</Badge>}
          />
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Δ</th></tr></thead>
              <tbody>
                {Object.entries(result.overall).map(([key, v]) => (
                  <tr key={key}>
                    <td className="small">{key}</td>
                    <td className="small">{v.a}</td>
                    <td className="small">{v.b}</td>
                    <td className="small" style={{ color: v.delta > 0 ? 'var(--good)' : v.delta < 0 ? 'var(--bad)' : undefined }}>{v.delta > 0 ? '+' : ''}{v.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.suites.map((s) => (
            <details key={s.suiteId} style={{ borderTop: '1px solid var(--border)', padding: '8px 12px' }}>
              <summary className="small" style={{ cursor: 'pointer' }}>{s.name} (latency {s.latencyA} → {s.latencyB ?? '—'} ms)</summary>
              <table className="table" style={{ marginTop: 6 }}>
                <thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Δ</th></tr></thead>
                <tbody>
                  {Object.entries(s.metrics).map(([k, v]) => (
                    <tr key={k}>
                      <td className="small faint">{k}</td>
                      <td className="small">{Number.isNaN(v.b) ? 'n/a' : v.a}</td>
                      <td className="small">{Number.isNaN(v.b) ? 'n/a' : v.b}</td>
                      <td className="small">{Number.isNaN(v.delta) ? '—' : `${v.delta > 0 ? '+' : ''}${v.delta}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div className="stat-label">{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
