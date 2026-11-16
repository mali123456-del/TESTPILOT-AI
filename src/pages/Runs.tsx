import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Ban,
  Bot,
  Bug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  PlayCircle,
  RefreshCw,
  Search,
  Timer,
  Zap,
} from 'lucide-react';
import type { Project, Run, TestCase, TestSuite } from '../../shared/types';
import { api, duration, when } from '../lib/api';
import { useAuth, useLiveRun, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Modal, PageHead, Progress, Skeleton } from '../components/ui';

type RunWithResults = Run;
type HistoryPage = { items: Run[]; total: number; page: number; pages: number };

const RUN_STATUSES = ['all', 'draft', 'queued', 'running', 'paused', 'passed', 'failed', 'blocked', 'cancelled', 'error', 'completed'];

export default function Runs() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('run');
  const [newOpen, setNewOpen] = useState(params.get('new') === '1');
  const projects = useResource<Project[]>('/projects');
  const [data, setData] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState({ status: 'all', mode: 'all', projectId: 'all', sort: 'newest', q: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<RunWithResults | null>(null);
  const { run: live } = useLiveRun(selectedId ? selectedId : null);

  // Debounce search input so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => (prev.q === search ? prev : { ...prev, q: search }));
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => {
    const qs = new URLSearchParams({ page: String(page), pageSize: '20', sort: filters.sort });
    if (filters.status !== 'all') qs.set('status', filters.status);
    if (filters.mode !== 'all') qs.set('mode', filters.mode);
    if (filters.projectId !== 'all') qs.set('projectId', filters.projectId);
    if (filters.q) qs.set('q', filters.q);
    return qs.toString();
  }, [page, filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<HistoryPage>(`/runs/history?${query}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setListError(null);
      })
      .catch((err) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : 'Unable to load runs');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (newOpen) {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
  }, [newOpen, params, setParams]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    const existing = data?.items.find((r) => r.id === selectedId);
    if (existing) setSelected(existing);
    api<Run>(`/runs/${selectedId}`).then(setSelected).catch(() => setNotice('Run not found'));
  }, [selectedId, data]);

  useEffect(() => {
    if (live) setSelected(live);
  }, [live]);

  const openRun = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('run', id);
    setParams(next);
  };

  const cancel = async () => {
    if (!selected) return;
    if (!window.confirm(selected.mode === 'manual' ? 'Cancel this manual run? Recorded results are preserved.' : 'Cancel this run?')) return;
    await api(`/runs/${selected.id}/cancel`, { method: 'POST' }).catch((e) => setNotice(e.message));
    refresh();
    if (selectedId) api<Run>(`/runs/${selectedId}`).then(setSelected).catch(() => undefined);
  };

  const visible = data?.items ?? [];

  return (
    <>
      <PageHead
        title="Execution center"
        sub="Automate suites, execute cases manually and inspect the evidence behind every result."
        actions={
          <>
            <button className="btn" onClick={refresh}><RefreshCw size={14} /> Refresh</button>
            {auth?.user.role !== 'viewer' && <button className="btn btn-primary" onClick={() => setNewOpen(true)}><PlayCircle size={14} /> New run</button>}
          </>
        }
      />
      {notice && <div className="badge badge-info" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{notice}</div>}

      <div className="split">
        <Card>
          <CardHead title="Run history" desc={`${data?.total ?? 0} run(s)`} />
          <div className="toolbar" style={{ padding: '0 18px 12px', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
              <input className="input" style={{ paddingLeft: 30 }} placeholder="Search run, tester, project…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search runs" />
            </div>
            <select className="select" style={{ width: 130 }} value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} aria-label="Filter by status">
              {RUN_STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
            </select>
            <select className="select" style={{ width: 120 }} value={filters.mode} onChange={(e) => { setFilters({ ...filters, mode: e.target.value }); setPage(1); }} aria-label="Filter by mode">
              <option value="all">All modes</option>
              <option value="automated">Automated</option>
              <option value="manual">Manual</option>
            </select>
            <select className="select" style={{ width: 150 }} value={filters.projectId} onChange={(e) => { setFilters({ ...filters, projectId: e.target.value }); setPage(1); }} aria-label="Filter by project">
              <option value="all">All projects</option>
              {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="select" style={{ width: 110 }} value={filters.sort} onChange={(e) => { setFilters({ ...filters, sort: e.target.value }); setPage(1); }} aria-label="Sort runs">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="duration">Duration</option>
            </select>
          </div>

          {loading && !data ? (
            <div className="card-body"><Skeleton height={120} /></div>
          ) : listError ? (
            <EmptyState title="Runs unavailable" desc={listError} action={<button className="btn btn-sm" onClick={refresh}>Retry</button>} />
          ) : visible.length === 0 ? (
            <EmptyState icon={<Zap size={18} />} title="No runs match" desc="Trigger an automated suite or start a manual run." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Run</th><th>Suite / trigger</th><th>Status</th><th>Progress</th><th>Duration</th><th>When</th></tr></thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} onClick={() => openRun(r.id)} style={{ cursor: 'pointer', background: selectedId === r.id ? 'var(--accent-soft)' : undefined }}>
                      <td className="mono small">
                        {r.id.slice(0, 13)}
                        <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase' }}>{r.mode ?? 'automated'}</div>
                      </td>
                      <td className="small">
                        <div>{projects.data?.find((p) => p.id === r.projectId)?.name ?? r.projectId}</div>
                        <div className="faint" style={{ fontSize: 11 }}>{r.trigger} · {r.assignee ?? r.triggeredBy}</div>
                      </td>
                      <td><Badge status={r.status} /></td>
                      <td className="small">{r.summary.passed}/{r.summary.total} passed{r.summary.failed + r.summary.error ? ` · ${r.summary.failed + r.summary.error} failed` : ''}</td>
                      <td className="small">{duration(r.durationMs)}</td>
                      <td className="small faint">{when(r.finishedAt ?? r.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.pages > 1 && (
            <div className="row" style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              <span className="small faint">Page {data.page} of {data.pages} · {data.total} run(s)</span>
              <div className="spacer" />
              <button className="btn btn-sm" disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page"><ChevronLeft size={13} /> Prev</button>
              <button className="btn btn-sm" disabled={data.page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">Next <ChevronRight size={13} /></button>
            </div>
          )}
        </Card>

        <Card>
          {!selected ? (
            <EmptyState icon={<PlayCircle size={18} />} title="Select a run" desc="Choose a run on the left to see progress, results and evidence." />
          ) : (
            <>
              <CardHead
                title={`Run ${selected.id.slice(0, 13)}`}
                desc={`${selected.summary.total} cases · ${selected.trigger} · ${selected.assignee ?? selected.triggeredBy}`}
                action={<Badge status={selected.status} />}
              />
              <div className="card-body stack" style={{ gap: 14 }}>
                <div className="grid grid-3" style={{ gap: 10 }}>
                  <div><div className="stat-label">Passed</div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--good)' }}>{selected.summary.passed}</div></div>
                  <div><div className="stat-label">Failed</div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--bad)' }}>{selected.summary.failed + selected.summary.error}</div></div>
                  <div><div className="stat-label">Duration</div><div style={{ fontSize: 20, fontWeight: 700 }}>{duration(selected.durationMs)}</div></div>
                </div>
                <Progress value={selected.summary.total ? ((selected.summary.total - (selected.summary.notRun ?? 0)) / selected.summary.total) * 100 : 0} />
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span className="small faint"><Timer size={12} /> started {when(selected.startedAt)}</span>
                  <div className="spacer" />
                  {selected.mode === 'manual' && (
                    <Link className="btn btn-sm btn-primary" to={`/app/runs/${selected.id}/execute`}><ClipboardList size={13} /> Open workspace</Link>
                  )}
                  {['queued', 'running', 'draft', 'paused'].includes(selected.status) && auth?.user.role !== 'viewer' && (
                    <button className="btn btn-sm btn-danger" onClick={cancel}><Ban size={13} /> Cancel</button>
                  )}
                  {selected.mode !== 'manual' && <button className="btn btn-sm" onClick={() => void analyse(selected.id, setSelected, setNotice)}><Bot size={13} /> AI triage</button>}
                </div>
                {selected.aiAnalysis && (
                  <div className="card" style={{ padding: 12, background: 'var(--accent-soft)' }}>
                    <div className="row small" style={{ fontWeight: 600, marginBottom: 6 }}><Bot size={13} /> Failure analysis</div>
                    <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{selected.aiAnalysis}</div>
                  </div>
                )}
                <div className="stack" style={{ gap: 6 }}>
                  {selected.results.map((r) => <ResultRow key={r.caseId} result={r} runId={selected.id} onCreated={() => setNotice('Defect created from the failure evidence.')} canAct={auth?.user.role !== 'viewer'} />)}
                  {selected.results.length === 0 && <div className="small faint">Waiting for the first result…</div>}
                </div>
                {selected.logs.length > 0 && (
                  <details>
                    <summary className="small muted" style={{ cursor: 'pointer' }}>Execution log ({selected.logs.length})</summary>
                    <pre className="code" style={{ marginTop: 8 }}>{selected.logs.join('\n')}</pre>
                  </details>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {newOpen && (
        <NewRunModal
          projects={projects.data ?? []}
          onClose={() => setNewOpen(false)}
          onStarted={(id, manual) => {
            setNewOpen(false);
            refresh();
            if (manual) navigate(`/app/runs/${id}/execute`);
            else openRun(id);
          }}
        />
      )}
    </>
  );
}

async function analyse(runId: string, setSelected: (r: Run) => void, setNotice: (s: string) => void) {
  try {
    const res = await api<{ analysis: string }>('/ai/analyze-run', { method: 'POST', body: { runId } });
    setNotice('AI triage complete.');
    setSelected({ ...(await api<Run>(`/runs/${runId}`)), aiAnalysis: res.analysis });
  } catch (err) {
    setNotice(err instanceof Error ? err.message : 'Analysis failed');
  }
}

function ResultRow({ result, runId, onCreated, canAct }: { result: Run['results'][number]; runId: string; onCreated: () => void; canAct: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const failed = result.status === 'failed' || result.status === 'error';

  const createBug = async () => {
    setBusy(true);
    try {
      const runs = await api<Run>(`/runs/${runId}`);
      await api('/bugs', {
        method: 'POST',
        body: {
          projectId: runs.projectId,
          title: `Failure: ${result.title}`,
          description: result.actualResult || result.message || 'Manual failure',
          severity: 'high',
          reproduction: result.evidence?.slice(0, 2000) ?? (result.attachments ?? []).join('\n') ?? 'Re-run the case from the execution center.',
          linkedRunId: runId,
          linkedCaseId: result.caseId,
        },
      });
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Badge status={result.status} />
        <span className="small truncate" style={{ flex: 1 }}>{result.title}</span>
        <span className="faint small nowrap">{result.durationMs}ms</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)' }}>
          <p className="small" style={{ margin: '10px 0' }}>{result.actualResult || result.message || 'No result recorded'}</p>
          {result.notes && <p className="small faint" style={{ margin: '0 0 10px' }}>{result.notes}</p>}
          {result.evidence && <pre className="code">{result.evidence}</pre>}
          {result.attachments?.length ? (
            <ul className="small" style={{ margin: '8px 0 0 18px' }}>
              {result.attachments.map((a) => <li key={a}><a href={a} target="_blank" rel="noreferrer">{a}</a></li>)}
            </ul>
          ) : null}
          {result.details && (
            <details style={{ marginTop: 8 }}>
              <summary className="small faint" style={{ cursor: 'pointer' }}>Structured details</summary>
              <pre className="code">{JSON.stringify(result.details, null, 2)}</pre>
            </details>
          )}
          {failed && canAct && <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={createBug} disabled={busy}><Bug size={13} /> File defect</button>}
        </div>
      )}
    </div>
  );
}

function NewRunModal({ projects, onClose, onStarted }: { projects: Project[]; onClose: () => void; onStarted: (id: string, manual: boolean) => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const suites = useResource<Array<TestSuite & { caseCount: number }>>(projectId ? `/suites?projectId=${projectId}` : null);
  const allCases = useResource<TestCase[]>(projectId ? `/cases?projectId=${projectId}` : null);
  const [suiteId, setSuiteId] = useState('');
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'automated' | 'manual'>('automated');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suiteCases = useMemo(() => (allCases.data ?? []).filter((c) => !suiteId || c.suiteId === suiteId), [allCases.data, suiteId]);

  useEffect(() => {
    setSuiteId(suites.data?.[0]?.id ?? '');
  }, [suites.data]);

  useEffect(() => {
    setCaseIds(suiteCases.filter((c) => c.enabled).map((c) => c.id));
  }, [suiteCases]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await api<Run>('/runs', {
        method: 'POST',
        body: { projectId, suiteId: suiteId || undefined, caseIds, mode, assignee: mode === 'manual' ? assignee || undefined : undefined },
      });
      onStarted(run.id, mode === 'manual');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start run');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create a test run"
      onClose={onClose}
      wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={start} disabled={busy || !projectId || caseIds.length === 0}><PlayCircle size={14} /> {mode === 'manual' ? `Create draft for ${caseIds.length} case(s)` : `Start ${caseIds.length} case(s)`}</button></>}
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className={`btn btn-sm ${mode === 'automated' ? 'btn-primary' : ''}`} onClick={() => setMode('automated')}><Zap size={13} /> Automated</button>
          <button className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : ''}`} onClick={() => setMode('manual')}><ClipboardList size={13} /> Manual</button>
        </div>
        <div className="hint">
          {mode === 'automated'
            ? 'The engine runs every selected case and records real evidence. Browser cases rely on the optional Playwright adapter.'
            : 'Creates a draft run you complete case by case in the execution workspace. Nothing is executed automatically.'}
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Project">
            <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Suite">
            <select className="select" value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>
              <option value="">All cases in project</option>
              {suites.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.caseCount})</option>)}
            </select>
          </Field>
        </div>
        {mode === 'manual' && (
          <Field label="Assign to" hint="Optional tester name shown in the workspace and reports.">
            <input className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Tester name" />
          </Field>
        )}
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="label">Cases ({caseIds.length}/{suiteCases.length})</span>
            <div className="row">
              <button className="btn btn-sm btn-ghost" onClick={() => setCaseIds(suiteCases.map((c) => c.id))}>Select all</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setCaseIds([])}>Clear</button>
            </div>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            {suiteCases.map((c) => (
              <label key={c.id} className="list-row" style={{ cursor: 'pointer', padding: '8px 12px' }}>
                <input
                  type="checkbox"
                  checked={caseIds.includes(c.id)}
                  onChange={(e) => setCaseIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
                />
                <span className="small" style={{ flex: 1 }}>{c.title}</span>
                <span className="badge">{c.type}</span>
              </label>
            ))}
            {!suiteCases.length && <div className="empty small">No cases in this selection.</div>}
          </div>
        </div>
        {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
      </div>
    </Modal>
  );
}
