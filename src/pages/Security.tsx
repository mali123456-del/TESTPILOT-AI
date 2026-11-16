import { useEffect, useState } from 'react';
import { ScanLine, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { Project, SecurityScan } from '../../shared/types';
import { api, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, PageHead, Ring } from '../components/ui';

export default function Security() {
  const { auth } = useAuth();
  const projects = useResource<Project[]>('/projects');
  const scans = useResource<SecurityScan[]>('/security');
  const [projectId, setProjectId] = useState('');
  const [url, setUrl] = useState('http://127.0.0.1:4318/api/health');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canAct = auth?.user?.role !== 'viewer';

  useEffect(() => {
    if (!projectId && projects.data?.[0]) setProjectId(projects.data[0].id);
  }, [projects.data, projectId]);

  const selected = scans.data?.find((s) => s.id === selectedId) ?? scans.data?.[0];

  const scan = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<SecurityScan>('/security/scan', { method: 'POST', body: { projectId, url } });
      setSelectedId(res.id);
      scans.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  };

  if (projects.loading && !projects.data) return <Loading />;

  return (
    <>
      <PageHead
        title="Security workspace"
        sub="Passive hardening checks: transport, headers, cookie flags, CORS and disclosure. Non-intrusive by design."
        actions={<Badge tone={selected && selected.score >= 70 ? 'good' : 'warn'}>{selected ? `score ${selected.score}/100` : 'not scanned'}</Badge>}
      />
      {error && <div className="badge badge-bad" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{error}</div>}

      <div className="split">
        <div className="stack">
          <Card>
            <CardHead title="Passive scan" desc="Read-only header inspection. No exploit payloads are sent." />
            <div className="card-body stack" style={{ gap: 14 }}>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <Field label="Project">
                  <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                </Field>
                <Field label="Target URL"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
              </div>
              <button className="btn btn-primary" onClick={() => void scan()} disabled={busy || !projectId || !canAct}><ScanLine size={14} /> {busy ? 'Scanning…' : 'Run passive scan'}</button>
              <p className="hint">Scanning a third-party system without written authorisation may be illegal. Keep targets on the allowlist.</p>
            </div>
          </Card>

          {selected && (
            <Card>
              <CardHead
                title="Findings"
                desc={`${selected.url} · ${when(selected.createdAt)}`}
                action={<Badge status={selected.score >= 70 ? 'passed' : 'failed'}>{selected.score}/100</Badge>}
              />
              <div className="card-body stack" style={{ gap: 12 }}>
                <div className="row" style={{ gap: 18 }}>
                  <Ring value={selected.score} size={92} label="hardening" />
                  <div className="small muted">
                    {selected.findings.length === 0 ? 'No passive issues detected across the checked header set.' : `${selected.findings.length} finding(s). Prioritise high and medium severity before release.`}
                  </div>
                </div>
                {selected.findings.map((f) => (
                  <div key={f.id} className="card card-pad">
                    <div className="row"><Badge status={f.severity} /><b className="small">{f.title}</b></div>
                    <p className="small muted" style={{ margin: '6px 0' }}>{f.description}</p>
                    <div className="small"><span className="faint">Remediation:</span> {f.remediation}</div>
                    {f.evidence && <pre className="code" style={{ marginTop: 8 }}>{f.evidence}</pre>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card>
          <CardHead title="Scan history" desc={`${scans.data?.length ?? 0} scan(s)`} />
          {scans.data?.length ? (
            <div className="list">
              {scans.data.map((s) => (
                <button key={s.id} className="list-row" style={{ border: 'none', background: selected?.id === s.id ? 'var(--accent-soft)' : undefined, textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setSelectedId(s.id)}>
                  {s.score >= 70 ? <ShieldCheck size={15} style={{ color: 'var(--good)' }} /> : <ShieldAlert size={15} style={{ color: 'var(--warn)' }} />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small truncate">{s.url}</div>
                    <div className="faint" style={{ fontSize: 10.5 }}>{s.findings.length} findings · {when(s.createdAt)}</div>
                  </div>
                  <Badge tone={s.score >= 70 ? 'good' : 'warn'}>{s.score}</Badge>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ShieldCheck size={18} />} title="No scans yet" desc="Run a passive scan to baseline header hardening." />
          )}
        </Card>
      </div>
    </>
  );
}
