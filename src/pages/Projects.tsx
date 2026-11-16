import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, Bug, FileCode2, FolderPlus, PlayCircle, Plus, Trash2, Search, Archive, ArchiveRestore, Activity as ActivityIcon } from 'lucide-react';
import type { Bug as BugType, Project, TestCase, TestSuite, TestType, AuditEvent } from '../../shared/types';
import { api, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, Modal, PageHead, Ring, Tabs } from '../components/ui';

const TYPES: TestType[] = ['unit', 'integration', 'e2e', 'regression', 'smoke', 'acceptance', 'api', 'ui', 'database', 'accessibility', 'visual', 'performance', 'security', 'cross-browser'];

type ProjectRow = Project & { status?: 'active' | 'archived'; archivedAt?: string; suiteCount?: number; caseCount?: number; openBugCount?: number };

export default function Projects() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const projects = useResource<ProjectRow[]>('/projects');
  const detailProject = useMemo(() => projects.data?.find((p) => p.id === projectId), [projects.data, projectId]);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [envFilter, setEnvFilter] = useState('all');
  const [sort, setSort] = useState<'newest' | 'name' | 'score'>('newest');
  const [form, setForm] = useState({ name: '', key: '', description: '', repoUrl: '', baseUrl: '', environment: 'staging', allowedHosts: '127.0.0.1,localhost' });

  const createProject = async () => {
    setError(null);
    try {
      const created = await api<Project>('/projects', {
        method: 'POST',
        body: {
          ...form,
          allowedHosts: form.allowedHosts.split(',').map((h) => h.trim()).filter(Boolean),
        },
      });
      setCreateOpen(false);
      projects.reload();
      navigate(`/app/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project');
    }
  };

  if (projects.loading && !projects.data) return <Loading rows={4} />;
  if (projects.error) return <EmptyState title="Projects unavailable" desc={projects.error} />;

  if (projectId && detailProject) {
    return <ProjectDetail project={detailProject} onBack={() => navigate('/app/projects')} canManage={auth?.user.role !== 'viewer'} refreshList={() => projects.reload()} />;
  }

  const visible = (projects.data ?? []).filter(p => {
    if (statusFilter !== 'all' && (p.status ?? 'active') !== statusFilter) return false;
    if (envFilter !== 'all' && p.environment !== envFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'score') return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <>
      <PageHead
        title="Projects"
        sub="Repositories, environments and the suites that protect them."
        actions={auth?.user.role !== 'viewer' ? <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><FolderPlus size={14} /> New project</button> : undefined}
      />
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select className="select" style={{ width: 140 }} value={envFilter} onChange={e => setEnvFilter(e.target.value)}>
          <option value="all">All envs</option>
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
        <select className="select" style={{ width: 140 }} value={sort} onChange={e => setSort(e.target.value as any)}>
          <option value="newest">Newest</option>
          <option value="name">Name</option>
          <option value="score">Score</option>
        </select>
      </div>
      {!visible.length ? (
        <Card>
          <EmptyState icon={<Boxes size={20} />} title="No projects yet" desc="Create a project to attach suites, runs and defects." action={<button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>Create project</button>} />
        </Card>
      ) : (
        <div className="grid grid-3">
          {visible.map((p) => (
            <Link key={p.id} to={`/app/projects/${p.id}`} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: (p.status ?? 'active') === 'archived' ? 0.6 : 1 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', fontWeight: 700, color: 'var(--accent)' }}>
                  {p.key.slice(0, 2)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="card-title truncate">{p.name}</div>
                  <div className="faint small">{p.environment} · {p.key}</div>
                </div>
                <div style={{ marginLeft: 'auto' }}><Ring value={p.qualityScore ?? 0} size={54} label="score" /></div>
              </div>
              <p className="small muted" style={{ minHeight: 36 }}>{p.description || 'No description yet.'}</p>
              <div className="row small" style={{ justifyContent: 'space-between' }}>
                <span className="badge"><FileCode2 size={11} /> {p.baseUrl ? new URL(p.baseUrl).host : 'no target'}</span>
                <span className="faint">created {when(p.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {createOpen && (
        <Modal
          title="Create project"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createProject} disabled={!form.name || !form.key}>Create project</button>
            </>
          }
        >
          <div className="stack" style={{ gap: 14 }}>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <Field label="Project name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Orbit Commerce" /></Field>
              <Field label="Key" hint="Short prefix for run and defect IDs."><input className="input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase().slice(0, 8) })} placeholder="ORB" /></Field>
            </div>
            <Field label="Description"><textarea className="textarea" style={{ minHeight: 70 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <Field label="Repository URL"><input className="input" value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} placeholder="https://github.com/org/repo" /></Field>
              <Field label="Base URL under test"><input className="input" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://staging.example.com" /></Field>
            </div>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <Field label="Environment">
                <select className="select" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production (read-only recommended)</option>
                </select>
              </Field>
              <Field label="Allowed hosts" hint="Comma separated. Empty means workspace allowlist only."><input className="input" value={form.allowedHosts} onChange={(e) => setForm({ ...form, allowedHosts: e.target.value })} /></Field>
            </div>
            {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}

function ProjectDetail({ project, onBack, canManage, refreshList }: { project: ProjectRow; onBack: () => void; canManage: boolean; refreshList?: () => void }) {
  const { auth } = useAuth();
  const [tab, setTab] = useState('Suites');
  const suites = useResource<Array<TestSuite & { caseCount: number; lastRun?: import('../../shared/types').Run }>>(`/suites?projectId=${project.id}`);
  const cases = useResource<TestCase[]>(`/cases?projectId=${project.id}`);
  const bugs = useResource<BugType[]>(`/bugs?projectId=${project.id}`);
  const activity = useResource<AuditEvent[]>(`/projects/${project.id}/activity`);
  const [suiteOpen, setSuiteOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState<TestCase | null | 'new'>(null);
  const [suiteForm, setSuiteForm] = useState({ name: '', type: 'unit' as TestType, description: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [caseTypeFilter, setCaseTypeFilter] = useState('all');

  const handleBulk = async (action: 'delete' | 'enable' | 'disable' | 'duplicate') => {
    if (!selectedCaseIds.length) return;
    if (action === 'delete' && !window.confirm(`Delete ${selectedCaseIds.length} test cases?`)) return;
    try {
      await api('/cases/bulk', { method: 'POST', body: { ids: selectedCaseIds, action } });
      setSelectedCaseIds([]);
      cases.reload();
      setMessage(`Bulk ${action} completed successfully.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Bulk action failed');
    }
  };
  const [editForm, setEditForm] = useState({ name: project.name, description: project.description || '', baseUrl: project.baseUrl || '', repoUrl: project.repoUrl || '', environment: project.environment });

  const runSuite = async (suiteId: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const run = await api<{ id: string; summary: { total: number } }>('/runs', { method: 'POST', body: { projectId: project.id, suiteId } });
      setMessage(`Run queued (${run.summary.total} cases). Opening execution center…`);
      window.setTimeout(() => { window.location.href = `/app/runs?run=${run.id}`; }, 700);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to start run');
    } finally {
      setBusy(false);
    }
  };

  const createSuite = async () => {
    setBusy(true);
    try {
      await api('/suites', { method: 'POST', body: { ...suiteForm, projectId: project.id } });
      setSuiteOpen(false);
      setSuiteForm({ name: '', type: 'unit', description: '' });
      suites.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to create suite');
    } finally {
      setBusy(false);
    }
  };

  const deleteCase = async (id: string) => {
    if (!window.confirm('Delete this test case? This cannot be undone.')) return;
    await api(`/cases/${id}`, { method: 'DELETE' }).catch((err) => setMessage(err.message));
    cases.reload();
  };

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}><ArrowLeft size={14} /> All projects</button>
      <div className="hero" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>
            {project.key}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1>{project.name}</h1>
            <p className="page-sub">{project.description || 'No description'}</p>
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Badge tone="info">{project.environment}</Badge>
              <Badge>{project.baseUrl ?? 'no base URL'}</Badge>
              {project.repoUrl && <a className="badge" href={project.repoUrl} target="_blank" rel="noreferrer">repository ↗</a>}
            </div>
          </div>
          <div className="row" style={{ gap: 18 }}>
            <Ring value={project.qualityScore ?? 0} size={84} label="quality" />
            {canManage && (
              <div className="stack" style={{ gap: 6 }}>
                <button className="btn btn-sm" onClick={() => setSuiteOpen(true)}><Plus size={13} /> Suite</button>
                <Link className="btn btn-sm" to="/app/runs?new=1"><PlayCircle size={13} /> Run</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {message && <div className="badge badge-info" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{message}</div>}

      <Tabs tabs={['Suites', 'Cases', 'Defects', 'Activity', 'Settings']} active={tab} onChange={setTab} />

      {tab === 'Activity' && (
        <Card>
          <div className="list">
            {activity.data?.map(a => (
              <div key={a.id} className="list-row">
                <ActivityIcon size={14} className="faint" />
                <div className="health-info">
                  <strong>{a.action}</strong>
                  <small>{a.actor} · {when(a.createdAt)}</small>
                </div>
              </div>
            ))}
            {!activity.data?.length && <EmptyState title="No activity" desc="Project events will appear here." />}
          </div>
        </Card>
      )}

      {tab === 'Settings' && (
        <Card className="card-pad stack" style={{ gap: 16 }}>
          <h3>Project settings</h3>
          <div className="grid grid-2" style={{ gap: 12 }}>
            <Field label="Project name"><input className="input" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} /></Field>
            <Field label="Environment"><select className="select" value={editForm.environment} onChange={e => setEditForm({...editForm, environment: e.target.value as any})}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></Field>
          </div>
          <Field label="Description"><textarea className="textarea" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} /></Field>
          <div className="row">
            <button className="btn btn-primary" onClick={async () => {
               await api(`/projects/${project.id}`, { method: 'PATCH', body: editForm });
               setMessage('Settings saved');
               refreshList?.();
            }}>Save changes</button>
            <button className="btn btn-ghost" onClick={async () => {
               if (!confirm('Archive this project?')) return;
               await api(`/projects/${project.id}/archive`, { method: 'POST' });
               refreshList?.();
               onBack();
            }}><Archive size={14} /> Archive</button>
            {project.status === 'archived' && <button className="btn btn-ghost" onClick={async () => {
               await api(`/projects/${project.id}/restore`, { method: 'POST' });
               refreshList?.();
            }}><ArchiveRestore size={14} /> Restore</button>}
            <div className="spacer" />
            {(auth?.user.role === 'owner' || auth?.user.role === 'admin') && <button className="btn btn-danger" onClick={async () => {
               if (!confirm('DELETE PERMANENTLY?')) return;
               await api(`/projects/${project.id}`, { method: 'DELETE' });
               refreshList?.();
               onBack();
            }}><Trash2 size={14} /> Delete</button>}
          </div>
        </Card>
      )}

      {tab === 'Suites' && (
        <>
          {suites.loading && !suites.data ? <Loading /> : !suites.data?.length ? (
            <Card><EmptyState icon={<FileCode2 size={20} />} title="No suites yet" desc="Group related cases into a suite, then run it end to end." action={canManage ? <button className="btn btn-primary btn-sm" onClick={() => setSuiteOpen(true)}>Create suite</button> : undefined} /></Card>
          ) : (
            <div className="grid grid-3">
              {suites.data.map((s) => (
                <Card key={s.id} className="card-pad">
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="card-title" style={{ fontSize: 14 }}>{s.name}</div>
                      <div className="faint small" style={{ textTransform: 'capitalize' }}>{s.type.replace('-', ' ')} suite</div>
                    </div>
                    <span className="badge" style={{ marginLeft: 'auto' }}>{s.caseCount} cases</span>
                  </div>
                  <p className="small muted" style={{ margin: '10px 0', minHeight: 34 }}>{s.description}</p>
                  <div className="row">
                    <span className="small faint">{s.lastRun ? `last ${s.lastRun.status} · ${when(s.lastRun.finishedAt)}` : 'never run'}</span>
                    <div className="spacer" />
                    {canManage && (
                      <button className="btn btn-sm btn-primary" onClick={() => runSuite(s.id)} disabled={busy || s.caseCount === 0}>
                        <PlayCircle size={13} /> Run
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'Cases' && (
        <Card>
          <CardHead
            title={`${cases.data?.length ?? 0} test cases`}
            desc="Unit, API, data, browser and analysis adapters share one execution pipeline."
            action={canManage ? (
              <div className="row">
                <select className="select" style={{ width: 140 }} onChange={(e) => setCaseTypeFilter(e.target.value)}>
                  <option value="all">All types</option>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button className="btn btn-sm btn-primary" onClick={() => setCaseOpen('new')}><Plus size={13} /> Case</button>
              </div>
            ) : undefined}
          />
          {selectedCaseIds.length > 0 && (
            <div className="row" style={{ padding: '8px 18px', background: 'var(--accent-soft)' }}>
              <span className="small">{selectedCaseIds.length} selected</span>
              <button className="btn btn-sm" onClick={() => handleBulk('enable')}>Enable</button>
              <button className="btn btn-sm" onClick={() => handleBulk('disable')}>Disable</button>
              <button className="btn btn-sm" onClick={() => handleBulk('duplicate')}>Duplicate</button>
              <button className="btn btn-sm btn-danger" onClick={() => handleBulk('delete')}>Delete</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setSelectedCaseIds([])}>Cancel</button>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th><input type="checkbox" checked={selectedCaseIds.length === (cases.data?.length || 0) && cases.data?.length !== 0} onChange={(e) => setSelectedCaseIds(e.target.checked ? (cases.data?.map(c => c.id) || []) : [])} /></th>
                <th>Title</th><th>Type</th><th>Priority</th><th>Version</th><th>Status</th><th /></tr></thead>
              <tbody>
                {cases.data?.filter(c => caseTypeFilter === 'all' || c.type === caseTypeFilter).map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" checked={selectedCaseIds.includes(c.id)} onChange={(e) => setSelectedCaseIds(e.target.checked ? [...selectedCaseIds, c.id] : selectedCaseIds.filter(id => id !== c.id))} /></td>
                    <td style={{ maxWidth: 380 }}>
                      <div className="truncate" style={{ fontWeight: 550 }}>{c.title}</div>
                      <div className="faint small truncate">{c.expected || c.description || c.request?.url || c.targetUrl || 'sandboxed logic'}</div>
                    </td>
                    <td><span className="badge">{c.type}</span></td>
                    <td><Badge status={c.priority} /></td>
                    <td>v{c.version || 1}</td>
                    <td><Badge status={c.enabled ? 'active' : 'disabled'} /></td>
                    <td className="nowrap">
                      {canManage && <button className="btn btn-sm btn-ghost" onClick={() => setCaseOpen(c)}>Edit</button>}
                      {(auth?.user.role === 'owner' || auth?.user.role === 'qa_lead') ? (
                        <button className="btn btn-sm btn-ghost" onClick={() => deleteCase(c.id)} aria-label="Delete case"><Trash2 size={13} /></button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cases.loading && !cases.data?.length && <EmptyState title="No cases" desc="Add a case or generate drafts with the AI assistant." />}
          </div>
        </Card>
      )}

      {tab === 'Defects' && (
        <div className="grid grid-2">
          {bugs.data?.map((b) => (
            <Card key={b.id} className="card-pad">
              <div className="row"><Bug size={15} style={{ color: 'var(--bad)' }} /><span className="card-title">{b.title}</span><span style={{ marginLeft: 'auto' }}><Badge status={b.severity} /></span></div>
              <p className="small muted" style={{ margin: '8px 0' }}>{b.description}</p>
              <div className="row small"><Badge status={b.status} /><span className="faint">{when(b.createdAt)}</span></div>
            </Card>
          ))}
          {!bugs.data?.length && <Card><EmptyState title="No defects" desc="Nothing filed against this project yet." /></Card>}
        </div>
      )}

      {suiteOpen && (
        <Modal title="Create suite" onClose={() => setSuiteOpen(false)} footer={<><button className="btn btn-ghost" onClick={() => setSuiteOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={createSuite} disabled={busy || !suiteForm.name}>Create suite</button></>}>
          <div className="stack" style={{ gap: 14 }}>
            <Field label="Suite name"><input className="input" value={suiteForm.name} onChange={(e) => setSuiteForm({ ...suiteForm, name: e.target.value })} placeholder="Checkout smoke" /></Field>
            <Field label="Primary test type">
              <select className="select" value={suiteForm.type} onChange={(e) => setSuiteForm({ ...suiteForm, type: e.target.value as TestType })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Description"><textarea className="textarea" style={{ minHeight: 70 }} value={suiteForm.description} onChange={(e) => setSuiteForm({ ...suiteForm, description: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {caseOpen && (
        <CaseModal
          project={project}
          suites={suites.data ?? []}
          existing={caseOpen === 'new' ? null : caseOpen}
          onClose={() => setCaseOpen(null)}
          onSaved={() => { setCaseOpen(null); cases.reload(); suites.reload(); }}
        />
      )}
    </>
  );
}

function CaseModal({ project, suites, existing, onClose, onSaved }: { project: Project; suites: Array<TestSuite & { caseCount: number }>; existing: TestCase | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    suiteId: existing?.suiteId ?? suites[0]?.id ?? '',
    title: existing?.title ?? '',
    type: existing?.type ?? 'unit',
    priority: existing?.priority ?? 'medium',
    description: existing?.description ?? '',
    code: existing?.code ?? '',
    url: existing?.request?.url ?? existing?.targetUrl ?? project.baseUrl ?? '',
    method: existing?.request?.method ?? 'GET',
    expectedStatus: existing?.request?.assertions?.status ?? 200,
    contains: existing?.request?.assertions?.contains ?? '',
    steps: existing?.steps?.join('\n') ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      suiteId: form.suiteId,
      title: form.title,
      type: form.type,
      priority: form.priority,
      description: form.description,
      steps: form.steps ? form.steps.split('\n').filter(Boolean) : undefined,
      targetUrl: ['accessibility', 'visual', 'security', 'e2e', 'ui', 'cross-browser'].includes(form.type) ? form.url : undefined,
      code: form.type === 'unit' || form.type === 'integration' ? form.code : undefined,
      request:
        form.type === 'api' || form.type === 'smoke' || form.type === 'regression' || form.type === 'acceptance'
          ? { method: form.method, url: form.url, assertions: { status: Number(form.expectedStatus), contains: form.contains || undefined } }
          : undefined,
      fixture:
        form.type === 'database'
          ? { tables: [{ table: 'items', rows: [] }], rules: { minRows: { items: 1 } } }
          : form.type === 'performance'
            ? { requests: 20, concurrency: 4 }
            : undefined,
    };
    try {
      if (existing) await api(`/cases/${existing.id}`, { method: 'PATCH', body });
      else await api('/cases', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save case');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={existing ? 'Edit test case' : 'New test case'}
      onClose={onClose}
      wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy || !form.title || !form.suiteId}>Save case</button></>}
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Discount is capped at 30%" /></Field>
          <Field label="Suite">
            <select className="select" value={form.suiteId} onChange={(e) => setForm({ ...form, suiteId: e.target.value })}>
              {suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-3" style={{ gap: 12 }}>
          <Field label="Type">
            <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TestCase['type'] })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TestCase['priority'] })}>
              {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Target URL" hint="Used by API, browser and analysis cases."><input className="input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></Field>
        </div>

        {form.type === 'unit' || form.type === 'integration' ? (
          <Field label="Sandboxed test code" hint="Uses expect() matchers and optional test(name, fn) blocks. No filesystem, network, require or async.">
            <textarea className="textarea" style={{ minHeight: 150 }} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={"const total = 2 + 2;\nexpect(total).toBe(4);\ntest('rejects negatives', () => { expect(() => { throw new Error('x'); }).toThrow(); });"} />
          </Field>
        ) : form.type === 'api' || form.type === 'smoke' || form.type === 'regression' || form.type === 'acceptance' ? (
          <div className="grid grid-3" style={{ gap: 12 }}>
            <Field label="Method"><select className="select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as typeof form.method })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Expected status"><input className="input" type="number" value={form.expectedStatus} onChange={(e) => setForm({ ...form, expectedStatus: Number(e.target.value) })} /></Field>
            <Field label="Body contains"><input className="input" value={form.contains} onChange={(e) => setForm({ ...form, contains: e.target.value })} placeholder="optional substring" /></Field>
          </div>
        ) : form.type === 'database' ? (
          <Field label="Fixture note" hint="Edit the JSON fixture after creation to match your dataset (tables[] + rules)."><div className="hint">A starter fixture with one empty table is created so you can run the integrity checks immediately.</div></Field>
        ) : (
          <Field label="Browser steps (one per line)" hint={'Supported: click <selector>, fill <selector> <value>, expect <selector>, expect "text". Requires the optional Playwright adapter.'}>
            <textarea className="textarea" style={{ minHeight: 110 }} value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} placeholder={'click button[type=submit]\nexpect "Order confirmed"'} />
          </Field>
        )}
        {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
        <div className="hint">Runs are bounded by the case timeout and the workspace allowlist. Never target systems you are not authorised to test.</div>
      </div>
    </Modal>
  );
}
