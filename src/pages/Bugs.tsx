import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bug as BugIcon, Plus, Sparkles } from 'lucide-react';
import type { Bug, Project } from '../../shared/types';
import { api, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, Modal, PageHead } from '../components/ui';

export default function Bugs() {
  const { auth } = useAuth();
  const [params, setParams] = useSearchParams();
  const bugs = useResource<Bug[]>('/bugs');
  const projects = useResource<Project[]>('/projects');
  const [status, setStatus] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [selected, setSelected] = useState<Bug | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canAct = auth?.user.role !== 'viewer';

  const visible = useMemo(
    () =>
      (bugs.data ?? []).filter(
        (b) => (status === 'all' || b.status === status) && (severity === 'all' || b.severity === severity),
      ),
    [bugs.data, status, severity],
  );

  const openCreate = () => {
    setCreateOpen(true);
    params.delete('new');
    setParams(params, { replace: true });
  };

  const changeStatus = async (bug: Bug, next: string) => {
    await api(`/bugs/${bug.id}`, { method: 'PATCH', body: { status: next } }).catch((e) => setNotice(e.message));
    bugs.reload();
    setNotice(`Defect moved to ${next.replace('_', ' ')}.`);
  };

  const counts = {
    open: bugs.data?.filter((b) => b.status === 'open').length ?? 0,
    critical: bugs.data?.filter((b) => b.severity === 'critical' && b.status !== 'closed' && b.status !== 'resolved').length ?? 0,
    resolved: bugs.data?.filter((b) => b.status === 'resolved' || b.status === 'closed').length ?? 0,
  };

  if (bugs.loading && !bugs.data) return <Loading rows={4} />;

  return (
    <>
      <PageHead
        title="Defects"
        sub="Track failures from evidence to resolution. AI root-cause notes are stored beside human updates."
        actions={canAct ? <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> New defect</button> : undefined}
      />
      {notice && <div className="badge badge-info" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{notice}</div>}

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Card className="stat"><div className="stat-label">Open</div><div className="stat-value">{counts.open}</div></Card>
        <Card className="stat"><div className="stat-label">Critical unresolved</div><div className="stat-value" style={{ color: counts.critical ? 'var(--bad)' : undefined }}>{counts.critical}</div></Card>
        <Card className="stat"><div className="stat-label">Resolved / closed</div><div className="stat-value">{counts.resolved}</div></Card>
      </div>

      <Card>
        <CardHead
          title={`${visible.length} defect(s)`}
          desc="Severity and status drive release-readiness pressure."
          action={
            <div className="row">
              <select className="select" style={{ width: 130 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                {['all', 'open', 'in_progress', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="select" style={{ width: 120 }} value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
                {['all', 'critical', 'high', 'medium', 'low'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          }
        />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Defect</th><th>Project</th><th>Severity</th><th>Status</th><th>Assignee</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {visible.map((b) => (
                <tr key={b.id}>
                  <td style={{ maxWidth: 380 }}>
                    <button className="btn btn-ghost btn-sm" style={{ padding: 0, whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setSelected(b)}>
                      <span style={{ fontWeight: 600 }}>{b.title}</span>
                    </button>
                    <div className="faint small truncate">{b.description}</div>
                  </td>
                  <td className="small">{projects.data?.find((p) => p.id === b.projectId)?.name ?? b.projectId}</td>
                  <td><Badge status={b.severity} /></td>
                  <td><Badge status={b.status} /></td>
                  <td className="small muted">{b.assignee ?? 'unassigned'}</td>
                  <td className="small faint">{when(b.updatedAt)}</td>
                  <td>
                    {canAct && b.status !== 'closed' && (
                      <select className="select" style={{ width: 118 }} value={b.status} onChange={(e) => void changeStatus(b, e.target.value)} aria-label={`Change status for ${b.title}`}>
                        {['open', 'in_progress', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <EmptyState icon={<BugIcon size={18} />} title="No defects match" desc="Adjust the filters or file a new defect from a failed run." />}
        </div>
      </Card>

      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)} wide footer={<button className="btn" onClick={() => setSelected(null)}>Close</button>}>
          <div className="stack" style={{ gap: 14 }}>
            <div className="row"><Badge status={selected.severity} /><Badge status={selected.status} /><span className="small faint">{when(selected.createdAt)}</span></div>
            <p className="small">{selected.description}</p>
            {selected.reproduction && (
              <div>
                <div className="label">Reproduction</div>
                <pre className="code" style={{ whiteSpace: 'pre-wrap' }}>{selected.reproduction}</pre>
              </div>
            )}
            {selected.aiRootCause && (
              <div className="card" style={{ padding: 12, background: 'var(--accent-soft)' }}>
                <div className="row small" style={{ fontWeight: 600, marginBottom: 6 }}><Sparkles size={13} /> AI root-cause assistance</div>
                <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{selected.aiRootCause}</p>
              </div>
            )}
            <div className="kv">
              <dt>Assignee</dt><dd>{selected.assignee ?? 'unassigned'}</dd>
              <dt>Linked run</dt><dd className="mono small">{selected.linkedRunId ?? '—'}</dd>
              <dt>Linked case</dt><dd className="mono small">{selected.linkedCaseId ?? '—'}</dd>
            </div>
          </div>
        </Modal>
      )}

      {createOpen && (
        <CreateBugModal
          projects={projects.data ?? []}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); bugs.reload(); setNotice('Defect created.'); }}
        />
      )}
    </>
  );
}

function CreateBugModal({ projects, onClose, onSaved }: { projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ projectId: projects[0]?.id ?? '', title: '', description: '', severity: 'medium', reproduction: '' });
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      await api('/bugs', { method: 'POST', body: form });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create defect');
    }
  };

  return (
    <Modal title="New defect" onClose={onClose} wide footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!form.title || !form.description || !form.projectId}>Create defect</button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Project">
            <select className="select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Severity">
            <select className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Coupon stacking exceeds the maximum discount" /></Field>
        <Field label="Description"><textarea className="textarea" style={{ minHeight: 90 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Reproduction steps"><textarea className="textarea" style={{ minHeight: 90 }} value={form.reproduction} onChange={(e) => setForm({ ...form, reproduction: e.target.value })} placeholder={'1. Open …\n2. Click …\n3. Observe …'} /></Field>
        {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
      </div>
    </Modal>
  );
}
