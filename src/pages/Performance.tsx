import { useEffect, useState } from 'react';
import { Activity, Gauge, Play } from 'lucide-react';
import type { PerfRun, Project } from '../../shared/types';
import { api, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Bars, Card, CardHead, EmptyState, Field, Loading, PageHead, Stat } from '../components/ui';

export default function Performance() {
  const { auth } = useAuth();
  const projects = useResource<Project[]>('/projects');
  const runs = useResource<PerfRun[]>('/performance');
  const [projectId, setProjectId] = useState('');
  const [url, setUrl] = useState('http://127.0.0.1:4318/api/health');
  const [requests, setRequests] = useState(40);
  const [concurrency, setConcurrency] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canAct = auth?.user.role !== 'viewer';

  useEffect(() => {
    if (!projectId && projects.data?.[0]) setProjectId(projects.data[0].id);
  }, [projects.data, projectId]);

  const selected = runs.data?.find((r) => r.id === selectedId) ?? runs.data?.[0];

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<PerfRun>('/performance', { method: 'POST', body: { projectId, url, requests, concurrency } });
      setSelectedId(res.id);
      runs.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load test failed');
    } finally {
      setBusy(false);
    }
  };

  if (projects.loading && !projects.data) return <Loading />;

  return (
    <>
      <PageHead
        title="Performance workspace"
        sub="Bounded load profiles with real latency percentiles. Hard caps: 200 requests and 20 concurrent workers."
        actions={<Badge tone="info"><Gauge size={11} /> local runner</Badge>}
      />
      {error && <div className="badge badge-bad" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{error}</div>}

      <div className="split">
        <div className="stack">
          <Card>
            <CardHead title="Load profile" desc="Only run against environments you are authorised to test." />
            <div className="card-body stack" style={{ gap: 14 }}>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <Field label="Project">
                  <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                </Field>
                <Field label="Target URL"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
              </div>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <Field label="Total requests" hint="1–200"><input className="input" type="number" min={1} max={200} value={requests} onChange={(e) => setRequests(Number(e.target.value))} /></Field>
                <Field label="Concurrency" hint="1–20 workers"><input className="input" type="number" min={1} max={20} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} /></Field>
              </div>
              <button className="btn btn-primary" onClick={() => void start()} disabled={busy || !projectId || !canAct}><Play size={14} /> {busy ? 'Running profile…' : 'Start load profile'}</button>
              <p className="hint">Latency is measured client-side including connection setup. Throughput is bounded by this machine and is labelled accordingly.</p>
            </div>
          </Card>

          {selected?.metrics && (
            <Card>
              <CardHead title="Latest profile" desc={selected.url} action={<Badge status={selected.metrics.errorRate > 5 ? 'failed' : 'passed'}>{selected.metrics.errorRate}% errors</Badge>} />
              <div className="card-body stack" style={{ gap: 16 }}>
                <div className="grid grid-4" style={{ gap: 10 }}>
                  <Stat label="p50" value={`${selected.metrics.p50}ms`} />
                  <Stat label="p95" value={`${selected.metrics.p95}ms`} tone={selected.metrics.p95 > 1000 ? 'warn' : 'good'} />
                  <Stat label="p99" value={`${selected.metrics.p99}ms`} />
                  <Stat label="Throughput" value={`${selected.metrics.rps}/s`} />
                </div>
                <Bars data={[{ label: 'min', value: selected.metrics.min }, { label: 'avg', value: selected.metrics.avg }, { label: 'p50', value: selected.metrics.p50 }, { label: 'p95', value: selected.metrics.p95 }, { label: 'p99', value: selected.metrics.p99 }, { label: 'max', value: selected.metrics.max }]} height={150} />
                <div className="small faint">{selected.requests} requests · {selected.concurrency} workers · {selected.metrics.errors} errors</div>
              </div>
            </Card>
          )}
        </div>

        <Card>
          <CardHead title="Profile history" desc={`${runs.data?.length ?? 0} stored profile(s)`} />
          {runs.data?.length ? (
            <div className="list">
              {runs.data.map((r) => (
                <button key={r.id} className="list-row" style={{ background: selected?.id === r.id ? 'var(--accent-soft)' : undefined, border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setSelectedId(r.id)}>
                  <Activity size={15} className="faint" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small truncate">{r.url}</div>
                    <div className="faint" style={{ fontSize: 10.5 }}>{r.requests} req · {r.concurrency} workers · {when(r.createdAt)}</div>
                  </div>
                  <Badge status={r.status === 'completed' ? 'passed' : r.status} >{r.status === 'completed' ? `p95 ${r.metrics?.p95 ?? 0}ms` : r.status}</Badge>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Gauge size={18} />} title="No load profiles" desc="Run a bounded profile to measure p50/p95/p99 latency." />
          )}
        </Card>
      </div>
    </>
  );
}
