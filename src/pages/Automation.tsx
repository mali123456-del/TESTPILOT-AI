import { useState } from 'react';
import { CalendarClock, PlayCircle, Plus, Power, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import type { Project, Schedule, TestSuite, Workflow } from '../../shared/types';
import { api, duration, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, Modal, PageHead, Tabs } from '../components/ui';

interface WorkflowRunResult {
  workflowId: string;
  runIds: string[];
  halted: boolean;
  durationMs: number;
  log: Array<{ step: string; type: string; status: string; detail?: string }>;
}

export default function Automation() {
  const { auth } = useAuth();
  const [tab, setTab] = useState('Workflows');
  const projects = useResource<Project[]>('/projects');
  const workflows = useResource<Workflow[]>('/workflows');
  const schedules = useResource<Schedule[]>('/schedules');
  const [runOpen, setRunOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [result, setResult] = useState<WorkflowRunResult | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = auth?.user.role !== 'viewer';

  const runWorkflow = async (id: string) => {
    setRunningId(id);
    setError(null);
    try {
      const res = await api<WorkflowRunResult>(`/workflows/${id}/run`, { method: 'POST' });
      setResult(res);
      setRunOpen(true);
      workflows.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workflow failed to start');
    } finally {
      setRunningId(null);
    }
  };

  const toggleSchedule = async (s: Schedule) => {
    await api(`/schedules/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } });
    schedules.reload();
  };

  const deleteSchedule = async (s: Schedule) => {
    if (!window.confirm(`Delete schedule “${s.name}”?`)) return;
    await api(`/schedules/${s.id}`, { method: 'DELETE' });
    schedules.reload();
  };

  if (workflows.loading && !workflows.data) return <Loading rows={4} />;

  return (
    <>
      <PageHead
        title="Automation studio"
        sub="Compose reusable workflows, schedule suites and enforce approval gates."
        actions={
          canManage ? (
            <button className="btn btn-primary" onClick={() => setScheduleOpen(true)}><Plus size={14} /> New schedule</button>
          ) : undefined
        }
      />
      {error && <div className="badge badge-bad" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{error}</div>}
      {notice && <div className="badge badge-good" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{notice}</div>}

      <Tabs tabs={['Workflows', 'Schedules']} active={tab} onChange={setTab} />

      {tab === 'Workflows' && (
        <div className="grid grid-2">
          {workflows.data?.map((w) => (
            <Card key={w.id}>
              <CardHead
                title={w.name}
                desc={`${w.steps.length} steps · retry ${w.retry.attempts} · ${w.parallel ? 'parallel' : 'sequential'}`}
                action={<Badge status={w.enabled ? 'active' : 'unavailable'}>{w.enabled ? 'enabled' : 'disabled'}</Badge>}
              />
              <div className="card-body stack" style={{ gap: 10 }}>
                <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {w.steps.map((s) => (
                    <li key={s.id} className="small">
                      <span style={{ fontWeight: 550 }}>{s.label}</span>
                      <span className="badge" style={{ marginLeft: 8 }}>{s.type}</span>
                    </li>
                  ))}
                </ol>
                <div className="row small faint">
                  <span>last run {when(w.lastRunAt)}</span>
                  <div className="spacer" />
                  {canManage && (
                    <button className="btn btn-sm btn-primary" onClick={() => void runWorkflow(w.id)} disabled={runningId === w.id}>
                      <PlayCircle size={13} /> {runningId === w.id ? 'Running…' : 'Run workflow'}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {!workflows.data?.length && <Card><EmptyState icon={<WorkflowIcon size={20} />} title="No workflows" desc="Workflows chain suites, conditions, delays and approvals." /></Card>}
        </div>
      )}

      {tab === 'Schedules' && (
        <Card>
          <CardHead title="Scheduled runs" desc="A background scheduler evaluates due suites every 30 seconds with a two-run safety cap." />
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Cadence</th><th>Last run</th><th>Enabled</th><th /></tr></thead>
              <tbody>
                {schedules.data?.map((s) => (
                  <tr key={s.id}>
                    <td className="small" style={{ fontWeight: 550 }}>{s.name}</td>
                    <td className="small">every {s.intervalMinutes >= 60 ? `${s.intervalMinutes / 60}h` : `${s.intervalMinutes}m`}</td>
                    <td className="small faint">{when(s.lastRunAt)}</td>
                    <td><button className="btn btn-sm" onClick={() => void toggleSchedule(s)} disabled={!canManage}><Power size={12} /> {s.enabled ? 'On' : 'Off'}</button></td>
                    <td>{canManage && <button className="btn btn-sm btn-ghost" onClick={() => void deleteSchedule(s)} aria-label="Delete schedule"><Trash2 size={13} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!schedules.data?.length && <EmptyState icon={<CalendarClock size={18} />} title="No schedules" desc="Create a schedule to run a suite unattended." />}
          </div>
        </Card>
      )}

      {runOpen && result && (
        <Modal title="Workflow execution" onClose={() => setRunOpen(false)} wide footer={<button className="btn" onClick={() => setRunOpen(false)}>Close</button>}>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row">
              <Badge status={result.halted ? 'awaiting_approval' : 'completed'}>{result.halted ? 'paused / halted' : 'completed'}</Badge>
              <span className="small muted">{duration(result.durationMs)}</span>
              <span className="small faint">{result.runIds.length} run(s) created</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {result.log.map((l, i) => (
                <div key={`${l.step}-${i}`} className="list-row" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <Badge status={l.status} />
                  <div className="small"><b>{l.step}</b> <span className="faint">{l.type}</span></div>
                  <span className="small faint" style={{ marginLeft: 'auto' }}>{l.detail ?? ''}</span>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {scheduleOpen && (
        <ScheduleModal
          projects={projects.data ?? []}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => { setScheduleOpen(false); schedules.reload(); setNotice('Schedule created.'); }}
        />
      )}
    </>
  );
}

function ScheduleModal({ projects, onClose, onSaved }: { projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const suites = useResource<TestSuite[]>(projectId ? `/suites?projectId=${projectId}` : null);
  const [form, setForm] = useState({ name: '', suiteId: '', intervalMinutes: 60 });
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      await api('/schedules', { method: 'POST', body: { ...form, projectId, intervalMinutes: Number(form.intervalMinutes) } });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create schedule');
    }
  };

  return (
    <Modal title="New schedule" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!form.name || !form.suiteId}>Create schedule</button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hourly smoke" /></Field>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Project">
            <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </Field>
          <Field label="Suite">
            <select className="select" value={form.suiteId} onChange={(e) => setForm({ ...form, suiteId: e.target.value })}>
              <option value="">Select a suite</option>
              {suites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Interval (minutes)" hint="Minimum 5. Low-spec runners are capped at two concurrent scheduled runs.">
          <input className="input" type="number" min={5} value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })} />
        </Field>
        {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
      </div>
    </Modal>
  );
}

