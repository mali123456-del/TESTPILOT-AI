import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  History,
  Pause,
  Play,
  Save,
  SkipForward,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { Project, Run, TestCase } from '../../shared/types';
import { api, duration, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, PageHead, Progress } from '../components/ui';

type ManualStatus = 'passed' | 'failed' | 'blocked' | 'skipped';

interface CaseHistoryEntry {
  runId: string;
  runStatus: string;
  status: string;
  durationMs: number;
  message?: string;
  actualResult?: string;
  notes?: string;
  executedBy: string;
  executedAt: string;
  mode: string;
}

export default function ExecutionWorkspace() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [actual, setActual] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState('');
  const [history, setHistory] = useState<CaseHistoryEntry[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  const cases = useResource<TestCase[]>(run?.projectId ? `/cases?projectId=${run.projectId}` : null);
  const projects = useResource<Project[]>('/projects');
  const readOnly = auth?.user.role === 'viewer';

  const load = useCallback(async () => {
    if (!runId) return;
    try {
      const data = await api<Run>(`/runs/${runId}`);
      setRun(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load run');
      return null;
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while the run is active so progress from other tabs is visible.
  useEffect(() => {
    if (!run || run.status !== 'running') return;
    const timer = window.setInterval(() => {
      if (!dirtyRef.current) void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [run, load]);

  const currentResult = useMemo(() => run?.results.find((r) => r.caseId === selectedCaseId), [run, selectedCaseId]);
  const currentCase = useMemo(() => cases.data?.find((c) => c.id === selectedCaseId), [cases.data, selectedCaseId]);

  const selectCase = useCallback(
    (id: string, force = false) => {
      if (!force && dirtyRef.current && !window.confirm('Discard unsaved changes for this test case?')) return;
      const result = run?.results.find((r) => r.caseId === id);
      setSelectedCaseId(id);
      setActual(result?.actualResult ?? '');
      setNotes(result?.notes ?? '');
      setAttachments((result?.attachments ?? []).join('\n'));
      setHistory(null);
      dirtyRef.current = false;
      setDirty(false);
    },
    [run],
  );

  // Default selection: the first case without a result.
  useEffect(() => {
    if (!run || selectedCaseId) return;
    const first = run.results.find((r) => r.status === 'not-run') ?? run.results[0];
    if (first) selectCase(first.caseId, true);
  }, [run, selectedCaseId, selectCase]);

  const markDirty = (updater: (value: string) => void) => (value: string) => {
    updater(value);
    dirtyRef.current = true;
    setDirty(true);
  };

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const applyRun = (next: Run) => {
    setRun(next);
    const result = next.results.find((r) => r.caseId === selectedCaseId);
    setActual(result?.actualResult ?? '');
    setNotes(result?.notes ?? '');
    setAttachments((result?.attachments ?? []).join('\n'));
    dirtyRef.current = false;
    setDirty(false);
  };

  const transition = async (action: 'start' | 'pause' | 'resume' | 'complete' | 'cancel') => {
    if (!run) return;
    setBusy(true);
    setNotice(null);
    try {
      if (action === 'cancel') {
        await api(`/runs/${run.id}/cancel`, { method: 'POST' });
        const next = await load();
        if (next) setNotice('Run cancelled. Results recorded so far are preserved.');
      } else {
        const next = await api<Run>(`/runs/${run.id}/${action}`, { method: 'POST' });
        setRun(next);
        setNotice(
          action === 'start'
            ? 'Run started. Record results as you execute each case.'
            : action === 'pause'
              ? 'Run paused. Resume whenever you are ready.'
              : action === 'resume'
                ? 'Run resumed.'
                : `Run completed as ${next.status}.`,
        );
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const save = async (status: ManualStatus) => {
    if (!run || !selectedCaseId) return;
    if ((status === 'failed' || status === 'blocked') && !actual.trim()) {
      setNotice('Describe the actual result before marking this case failed or blocked.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const next = await api<Run>(`/runs/${run.id}/results/${selectedCaseId}`, {
        method: 'POST',
        body: {
          status,
          actualResult: actual,
          notes,
          attachments: attachments.split('\n').map((a) => a.trim()).filter(Boolean),
        },
      });
      applyRun(next);
      setHistory(null);
      setNotice(`Recorded ${status} for this case.`);
      const nextCase = next.results.find((r) => r.status === 'not-run');
      if (nextCase && status !== 'skipped') selectCase(nextCase.caseId, true);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to save result');
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async () => {
    if (!selectedCaseId) return;
    setHistoryBusy(true);
    try {
      const res = await api<{ runs: CaseHistoryEntry[] }>(`/cases/${selectedCaseId}/history`);
      setHistory(res.runs);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to load case history');
    } finally {
      setHistoryBusy(false);
    }
  };

  const resetResult = async () => {
    if (!run || !selectedCaseId) return;
    if (!window.confirm('Clear the recorded result for this case?')) return;
    setBusy(true);
    try {
      const next = await api<Run>(`/runs/${run.id}/results/${selectedCaseId}`, { method: 'POST', body: { status: 'not-run' } });
      applyRun(next);
      setNotice('Result cleared.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to clear result');
    } finally {
      setBusy(false);
    }
  };

  const index = run?.results.findIndex((r) => r.caseId === selectedCaseId) ?? -1;
  const go = (delta: number) => {
    if (!run) return;
    const next = run.results[index + delta];
    if (next) selectCase(next.caseId);
  };

  // Keyboard navigation: left/right move between cases when not typing.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (!run && !error) return <Loading rows={5} />;
  if (error) return <EmptyState title="Run unavailable" desc={error} action={<Link className="btn btn-sm" to="/app/runs">Back to runs</Link>} />;
  if (!run) return null;

  const project = projects.data?.find((p) => p.id === run.projectId);
  const summary = run.summary;
  const done = summary.total - (summary.notRun ?? 0);
  const progress = summary.total ? (done / summary.total) * 100 : 0;
  const editable = !readOnly && ['draft', 'running', 'paused'].includes(run.status);

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => { if (!dirtyRef.current || window.confirm('Discard unsaved changes?')) navigate('/app/runs'); }} style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Execution center
      </button>

      <PageHead
        title={`Manual run · ${project?.name ?? run.projectId}`}
        sub={`${summary.total} case(s) · started ${when(run.startedAt)} · ${run.assignee ? `assigned to ${run.assignee}` : run.triggeredBy}`}
        actions={
          <div className="row">
            <Badge status={run.status} />
            {!readOnly && run.status === 'draft' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void transition('start')}><Play size={13} /> Start</button>}
            {!readOnly && run.status === 'running' && <button className="btn btn-sm" disabled={busy} onClick={() => void transition('pause')}><Pause size={13} /> Pause</button>}
            {!readOnly && run.status === 'paused' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void transition('resume')}><Play size={13} /> Resume</button>}
            {!readOnly && ['running', 'paused'].includes(run.status) && (
              <button
                className="btn btn-sm"
                disabled={busy || (summary.notRun ?? 0) > 0}
                title={(summary.notRun ?? 0) > 0 ? `${summary.notRun} case(s) still need a result` : 'Close this run'}
                onClick={() => void transition('complete')}
              >
                <CheckCircle2 size={13} /> Complete
              </button>
            )}
            {!readOnly && ['draft', 'running', 'paused'].includes(run.status) && (
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => { if (window.confirm('Cancel this run? Recorded results are preserved.')) void transition('cancel'); }}>
                <Ban size={13} /> Cancel
              </button>
            )}
          </div>
        }
      />

      {(notice || dirty) && (
        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          {notice && <div className="badge badge-info" style={{ padding: 8 }}>{notice}</div>}
          {dirty && <div className="badge badge-warn" style={{ padding: 8 }}>Unsaved changes</div>}
        </div>
      )}

      <Card className="card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="small faint">{done}/{summary.total} executed · {summary.passed} passed · {summary.failed} failed · {summary.blocked ?? 0} blocked · {summary.skipped} skipped · {summary.notRun ?? 0} not run</span>
          <span className="small faint">{summary.total ? Math.round(progress) : 0}%</span>
        </div>
        <Progress value={progress} />
        <div className="row small faint" style={{ marginTop: 8, gap: 14 }}>
          <span><Clock size={12} /> {run.status === 'running' ? 'Timer runs until complete' : run.durationMs ? duration(run.durationMs) : 'not finished'}</span>
          {run.pausedAt && <span>paused {when(run.pausedAt)}</span>}
          <span>Run {run.id.slice(0, 13)}</span>
        </div>
      </Card>

      <div className="split">
        <Card>
          <CardHead title="Cases" desc={`${run.results.length} in this run`} />
          <div className="list">
            {run.results.map((result) => (
              <button
                key={result.caseId}
                className="list-row"
                aria-current={result.caseId === selectedCaseId}
                onClick={() => selectCase(result.caseId)}
                style={{
                  width: '100%',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: result.caseId === selectedCaseId ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <StatusIcon status={result.status} />
                <div className="health-info" style={{ minWidth: 0 }}>
                  <span className="small truncate" style={{ display: 'block' }}>{result.title}</span>
                  <small className="faint">{result.type}{result.executedBy ? ` · ${result.executedBy}` : ''}</small>
                </div>
                <span style={{ marginLeft: 'auto' }}><Badge status={result.status} /></span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          {!selectedCaseId || !currentResult ? (
            <EmptyState icon={<CircleDashed size={18} />} title="Select a case" desc="Choose a case from the list to record its result." />
          ) : (
            <>
              <CardHead
                title={currentResult.title}
                desc={`Case ${currentResult.caseId.slice(0, 16)} · ${currentResult.type}`}
                action={<Badge status={currentResult.status} />}
              />
              <div className="card-body stack" style={{ gap: 14 }}>
                {currentCase?.description && <p className="small muted" style={{ margin: 0 }}>{currentCase.description}</p>}

                <div className="grid grid-2" style={{ gap: 12 }}>
                  <div>
                    <div className="stat-label">Steps</div>
                    {currentCase?.steps?.length ? (
                      <ol className="small" style={{ margin: '6px 0 0 18px', padding: 0 }}>
                        {currentCase.steps.map((step, i) => <li key={i} style={{ marginBottom: 4 }}>{step}</li>)}
                      </ol>
                    ) : (
                      <div className="small faint">No steps recorded for this case.</div>
                    )}
                  </div>
                  <div>
                    <div className="stat-label">Expected result</div>
                    <div className="small">{currentCase?.expected || currentResult.message || 'No expected result recorded.'}</div>
                    {currentCase?.tags?.length ? (
                      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {currentCase.tags.map((tag) => <span key={tag} className="badge">{tag}</span>)}
                      </div>
                    ) : null}
                  </div>
                </div>

                {!editable ? (
                  <div className="stack" style={{ gap: 10 }}>
                    <div>
                      <div className="stat-label">Actual result</div>
                      <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{currentResult.actualResult || 'No actual result recorded.'}</div>
                    </div>
                    {currentResult.notes && (
                      <div>
                        <div className="stat-label">Notes</div>
                        <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{currentResult.notes}</div>
                      </div>
                    )}
                    {currentResult.attachments?.length ? (
                      <div>
                        <div className="stat-label">Evidence</div>
                        <ul className="small" style={{ margin: '4px 0 0 18px', padding: 0 }}>
                          {currentResult.attachments.map((a) => <li key={a}><a href={a} target="_blank" rel="noreferrer">{a}</a></li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                <Field label="Actual result" hint="Required when marking a case failed or blocked.">
                  <textarea className="textarea" style={{ minHeight: 80 }} value={actual} onChange={(e) => markDirty(setActual)(e.target.value)} placeholder="What did you observe?" />
                </Field>
                <Field label="Notes">
                  <textarea className="textarea" style={{ minHeight: 60 }} value={notes} onChange={(e) => markDirty(setNotes)(e.target.value)} placeholder="Environment, context or follow-ups" />
                </Field>
                <Field label="Evidence links" hint="One URL or reference per line; stored with the result.">
                  <textarea className="textarea" style={{ minHeight: 50 }} value={attachments} onChange={(e) => markDirty(setAttachments)(e.target.value)} placeholder="https://…/screenshot.png" />
                </Field>
                  </>
                )}

                {editable && (
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save('passed')}><CheckCircle2 size={13} /> Pass</button>
                    <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => void save('failed')}><XCircle size={13} /> Fail</button>
                    <button className="btn btn-sm" disabled={busy} onClick={() => void save('blocked')}><ShieldAlert size={13} /> Blocked</button>
                    <button className="btn btn-sm" disabled={busy} onClick={() => void save('skipped')}><SkipForward size={13} /> Skip</button>
                    <div className="spacer" />
                    <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void resetResult()}>
                      <Save size={13} /> Reset to not run
                    </button>
                  </div>
                )}

                <div className="row">
                  <button className="btn btn-sm" onClick={() => go(-1)} disabled={index <= 0} aria-label="Previous case"><ArrowLeft size={13} /> Previous</button>
                  <button className="btn btn-sm" onClick={() => go(1)} disabled={index >= run.results.length - 1} aria-label="Next case">Next <ArrowRight size={13} /></button>
                  <div className="spacer" />
                  <button className="btn btn-sm btn-ghost" onClick={() => void loadHistory()} disabled={historyBusy}><History size={13} /> {historyBusy ? 'Loading…' : 'Case history'}</button>
                </div>

                {history && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div className="row small" style={{ fontWeight: 600, marginBottom: 6 }}><History size={13} /> Previous executions</div>
                    {history.length === 0 ? (
                      <div className="small faint">This case has no earlier execution records.</div>
                    ) : (
                      <div className="stack" style={{ gap: 6 }}>
                        {history.map((entry) => (
                          <div key={`${entry.runId}-${entry.executedAt}`} className="row small" style={{ gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                            <Badge status={entry.status} />
                            <span className="faint mono">{entry.runId.slice(0, 11)}</span>
                            <span className="truncate" style={{ flex: 1 }}>{entry.actualResult || entry.message || '—'}</span>
                            <span className="faint nowrap">{entry.executedBy} · {when(entry.executedAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {currentResult.executedAt && (
                  <div className="small faint">Last recorded {when(currentResult.executedAt)} by {currentResult.executedBy ?? 'unknown'}.</div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'passed') return <CheckCircle2 size={15} style={{ color: 'var(--good)', flexShrink: 0 }} />;
  if (status === 'failed') return <XCircle size={15} style={{ color: 'var(--bad)', flexShrink: 0 }} />;
  if (status === 'blocked') return <ShieldAlert size={15} style={{ color: 'var(--warn)', flexShrink: 0 }} />;
  if (status === 'skipped') return <SkipForward size={15} className="faint" style={{ flexShrink: 0 }} />;
  return <CircleDashed size={15} className="faint" style={{ flexShrink: 0 }} />;
}
