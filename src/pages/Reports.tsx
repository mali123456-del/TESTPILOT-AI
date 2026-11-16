import { useState } from 'react';
import { Download, FileBarChart, Plus, Printer } from 'lucide-react';
import type { Project, Report } from '../../shared/types';
import { api, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Bars, Card, CardHead, Donut, EmptyState, Field, Loading, Modal, PageHead, Progress, Ring, Sparkline, Stat } from '../components/ui';

interface Analytics {
  passRate: number;
  coverage: number;
  readiness: number;
  readinessBreakdown: Array<{ label: string; weight: number; value: number }>;
  trend: Array<{ id: string; date: string; passRate: number; durationMs: number; total: number }>;
  coverageByType: Array<{ type: string; total: number; automated: number; executed: number }>;
  defects: { bySeverity: Array<{ severity: string; count: number }>; byStatus: Array<{ status: string; count: number }> };
  flaky: Array<{ caseId: string; title: string; rate: number; passes: number; failures: number }>;
  teamRuns: Array<{ actor: string; runs: number }>;
  executed: number;
  openBugs: number;
}

const TONE: Record<string, string> = { critical: 'var(--bad)', high: 'var(--warn)', medium: 'var(--info)', low: 'var(--faint)' };

export default function Reports() {
  const { auth } = useAuth();
  const analytics = useResource<Analytics>('/analytics');
  const projects = useResource<Project[]>('/projects');
  const reports = useResource<Report[]>('/reports');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const canAct = auth?.user.role !== 'viewer';

  if (analytics.loading && !analytics.data) return <Loading rows={5} />;
  const a = analytics.data;
  if (!a) return <EmptyState title="Analytics unavailable" desc={analytics.error ?? undefined} />;

  return (
    <>
      <PageHead
        title="Reports & analytics"
        sub="Explainable quality metrics computed from stored executions, defects and coverage."
        actions={canAct ? <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Generate report</button> : undefined}
      />
      {notice && <div className="badge badge-good" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{notice}</div>}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Pass rate" value={`${a.passRate}%`} delta={`${a.executed} executed results`} tone={a.passRate >= 90 ? 'good' : 'warn'} />
        <Stat label="Case coverage" value={`${a.coverage}%`} delta="executed / total cases" />
        <Stat label="Release readiness" value={`${a.readiness}/100`} delta="weighted, explainable" tone={a.readiness >= 80 ? 'good' : 'warn'} />
        <Stat label="Open defects" value={a.openBugs} delta={`${a.flaky.length} flaky cases`} tone={a.openBugs ? 'warn' : 'good'} />
      </div>

      <div className="split" style={{ marginBottom: 16 }}>
        <Card>
          <CardHead title="Pass rate over time" desc="Each point is a completed run" />
          <div className="card-body"><Sparkline data={a.trend.map((t) => t.passRate)} height={110} /><div className="row small faint" style={{ marginTop: 8, justifyContent: 'space-between' }}><span>{a.trend[0]?.date ?? ''}</span><span>{a.trend.at(-1)?.date ?? ''}</span></div></div>
        </Card>
        <Card>
          <CardHead title="Release readiness" desc="Weighted components" />
          <div className="card-body row" style={{ gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring value={a.readiness} size={104} label="readiness" />
            <div className="stack" style={{ gap: 9, flex: 1, minWidth: 160 }}>
              {a.readinessBreakdown.map((b) => (
                <div key={b.label}>
                  <div className="row small" style={{ justifyContent: 'space-between' }}><span className="muted">{b.label} · {b.weight}%</span><b>{Math.round(b.value)}</b></div>
                  <Progress value={b.value} />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="split" style={{ marginBottom: 16 }}>
        <Card>
          <CardHead title="Coverage by test type" desc="Executed cases vs defined cases" />
          <div className="card-body stack" style={{ gap: 10 }}>
            {a.coverageByType.map((c) => (
              <div key={c.type}>
                <div className="row small"><span className="muted" style={{ textTransform: 'capitalize' }}>{c.type.replace('-', ' ')}</span><span className="faint" style={{ marginLeft: 'auto' }}>{c.executed}/{c.total} executed · {c.automated} automated</span></div>
                <Progress value={c.total ? (c.executed / c.total) * 100 : 0} />
              </div>
            ))}
            {!a.coverageByType.length && <div className="small faint">No cases defined yet.</div>}
          </div>
        </Card>
        <Card>
          <CardHead title="Defect distribution" desc="Severity and lifecycle" />
          <div className="card-body stack" style={{ gap: 18 }}>
            <Donut segments={a.defects.bySeverity.map((d) => ({ label: d.severity, value: d.count, color: TONE[d.severity] }))} />
            <div>
              <div className="stat-label" style={{ marginBottom: 8 }}>By status</div>
              <Bars data={a.defects.byStatus.map((s) => ({ label: s.status.replace('_', ' '), value: s.count }))} height={110} />
            </div>
          </div>
        </Card>
      </div>

      <div className="split" style={{ marginBottom: 16 }}>
        <Card>
          <CardHead title="Team productivity" desc="Runs triggered per actor" />
          <div className="card-body"><Bars data={a.teamRuns.slice(0, 8).map((t) => ({ label: t.actor.split(' ')[0], value: t.runs }))} height={130} /></div>
        </Card>
        <Card>
          <CardHead title="Flaky watch" desc="Intermittent cases in the recent window" />
          {a.flaky.length ? (
            <div className="list">
              {a.flaky.slice(0, 5).map((f) => (
                <div key={f.caseId} className="list-row">
                  <span className="small truncate" style={{ flex: 1 }}>{f.title}</span>
                  <span className="badge badge-warn">{f.rate}% fail</span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="Stable" desc="No flaky cases detected." />}
        </Card>
      </div>

      <Card>
        <CardHead title="Generated reports" desc="Exports are available as JSON or print-ready HTML (use the browser to save as PDF)." />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Report</th><th>Kind</th><th>Summary</th><th>Created</th><th>Export</th></tr></thead>
            <tbody>
              {reports.data?.map((r) => (
                <tr key={r.id}>
                  <td className="small" style={{ fontWeight: 600 }}>{r.title}</td>
                  <td><Badge>{r.kind}</Badge></td>
                  <td className="small muted" style={{ maxWidth: 420 }}><div className="truncate">{r.summary}</div></td>
                  <td className="small faint nowrap">{when(r.createdAt)}</td>
                  <td className="nowrap">
                    <a className="btn btn-sm btn-ghost" href={`/api/reports/${r.id}/export?format=json`}><Download size={12} /> JSON</a>
                    <a className="btn btn-sm btn-ghost" href={`/api/reports/${r.id}/export?format=html`} target="_blank" rel="noreferrer"><Printer size={12} /> HTML</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!reports.data?.length && <EmptyState icon={<FileBarChart size={18} />} title="No reports yet" desc="Generate a quality or release report to snapshot the current evidence." />}
        </div>
      </Card>

      {open && (
        <GenerateReportModal
          projects={projects.data ?? []}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); reports.reload(); setNotice('Report generated.'); }}
        />
      )}
    </>
  );
}

function GenerateReportModal({ projects, onClose, onSaved }: { projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ projectId: projects[0]?.id ?? '', kind: 'quality', title: '' });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Generate report" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={async () => {
      try { await api('/reports/generate', { method: 'POST', body: { ...form, title: form.title.trim() || undefined } }); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    }}>Generate</button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Project">
          <select className="select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
        <Field label="Report kind">
          <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="quality">Quality</option>
            <option value="execution">Execution</option>
            <option value="release">Release readiness</option>
          </select>
        </Field>
        <Field label="Title (optional)" hint="Defaults to “Project quality report”.">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
      </div>
    </Modal>
  );
}
