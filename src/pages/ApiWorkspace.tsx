import { useState } from 'react';
import { FolderOpen, Play, Plus, Save, Send } from 'lucide-react';
import type { ApiCollection, ApiResponseResult, Project, TestSuite } from '../../shared/types';
import { api, duration } from '../lib/api';
import { useResource } from '../lib/hooks';
import { Badge, Card, CardHead, CopyButton, EmptyState, Field, Loading, Modal, PageHead } from '../components/ui';

interface SendResult {
  result: ApiResponseResult;
  assertions: Array<{ label: string; ok: boolean }>;
  passed: boolean;
}

export default function ApiWorkspace() {
  const collections = useResource<ApiCollection[]>('/collections');
  const projects = useResource<Project[]>('/projects');
  const [collectionId, setCollectionId] = useState('');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('http://127.0.0.1:4318/api/health');
  const [headers, setHeaders] = useState('{\n  "accept": "application/json"\n}');
  const [body, setBody] = useState('');
  const [expectedStatus, setExpectedStatus] = useState(200);
  const [maxLatency, setMaxLatency] = useState(1000);
  const [contains, setContains] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const collection = collections.data?.find((c) => c.id === collectionId);

  const send = async () => {
    setBusy(true);
    setError(null);
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = headers.trim() ? JSON.parse(headers) : {};
    } catch {
      setError('Headers must be valid JSON');
      setBusy(false);
      return;
    }
    try {
      const res = await api<SendResult>('/request/send', {
        method: 'POST',
        body: {
          method,
          url,
          headers: parsedHeaders,
          body: body || undefined,
          assertions: { status: Number(expectedStatus), maxLatencyMs: Number(maxLatency), contains: contains || undefined },
        },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const loadRequest = (spec: { method: string; url: string; headers?: Record<string, string>; body?: string; assertions?: { status?: number; maxLatencyMs?: number; contains?: string } }) => {
    setMethod(spec.method);
    setUrl(spec.url);
    setHeaders(JSON.stringify(spec.headers ?? { accept: 'application/json' }, null, 2));
    setBody(spec.body ?? '');
    setExpectedStatus(spec.assertions?.status ?? 200);
    setMaxLatency(spec.assertions?.maxLatencyMs ?? 1000);
    setContains(spec.assertions?.contains ?? '');
  };

  return (
    <>
      <PageHead
        title="API workspace"
        sub="Send real HTTP requests, validate status, latency and payloads, then promote a request into a regression case."
        actions={<span className="badge badge-info">allowlisted targets only</span>}
      />
      {notice && <div className="badge badge-good" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{notice}</div>}

      <div className="split">
        <div className="stack">
          <Card>
            <CardHead
              title="Request builder"
              desc="Requests run server-side so cookies and CORS do not distort results."
              action={<select className="select" style={{ width: 210 }} value={collectionId} onChange={(e) => setCollectionId(e.target.value)} aria-label="Collection"><option value="">No collection</option>{collections.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            />
            <div className="card-body stack" style={{ gap: 14 }}>
              <div className="row" style={{ alignItems: 'stretch' }}>
                <select className="select" style={{ width: 108 }} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="HTTP method">
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => <option key={m}>{m}</option>)}
                </select>
                <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://staging.example.com/api/health" aria-label="Request URL" />
                <button className="btn btn-primary" onClick={() => void send()} disabled={busy}><Send size={14} /> {busy ? 'Sending…' : 'Send'}</button>
              </div>
              <div className="grid grid-3" style={{ gap: 10 }}>
                <Field label="Expected status"><input className="input" type="number" value={expectedStatus} onChange={(e) => setExpectedStatus(Number(e.target.value))} /></Field>
                <Field label="Max latency (ms)"><input className="input" type="number" value={maxLatency} onChange={(e) => setMaxLatency(Number(e.target.value))} /></Field>
                <Field label="Body contains"><input className="input" value={contains} onChange={(e) => setContains(e.target.value)} /></Field>
              </div>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <Field label="Headers (JSON)"><textarea className="textarea" style={{ minHeight: 90 }} value={headers} onChange={(e) => setHeaders(e.target.value)} /></Field>
                <Field label="Request body"><textarea className="textarea" style={{ minHeight: 90 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder='{ "email": "qa@example.com" }' /></Field>
              </div>
              <div className="row">
                <button className="btn btn-sm" onClick={() => setSaveOpen(true)}><Save size={13} /> Save as test case</button>
                <span className="hint">Targets must be on the project or workspace allowlist; cloud metadata addresses are always blocked.</span>
              </div>
              {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
            </div>
          </Card>

          {result && (
            <Card>
              <CardHead
                title="Response"
                desc={`${result.result.status} ${result.result.statusText} · ${duration(result.result.durationMs)} · ${result.result.size} bytes`}
                action={<Badge tone={result.passed ? 'good' : 'bad'}>{result.passed ? 'assertions passed' : 'assertion failed'}</Badge>}
              />
              <div className="card-body stack" style={{ gap: 12 }}>
                <div className="stack" style={{ gap: 4 }}>
                  {result.assertions.map((a) => <div key={a.label} className="small">{a.ok ? '✓' : '✗'} <span className={a.ok ? 'muted' : ''}>{a.label}</span></div>)}
                </div>
                <div>
                  <div className="row" style={{ justifyContent: 'space-between' }}><span className="label">Body</span><CopyButton value={result.result.bodySnippet} /></div>
                  <pre className="code" style={{ maxHeight: 300 }}>{result.result.bodySnippet}</pre>
                </div>
                <details>
                  <summary className="small muted" style={{ cursor: 'pointer' }}>Response headers</summary>
                  <pre className="code">{JSON.stringify(result.result.headers, null, 2)}</pre>
                </details>
              </div>
            </Card>
          )}
        </div>

        <Card>
          <CardHead title="Collections" desc={collection ? `${collection.requests.length} saved request(s)` : 'Select a collection'} action={<FolderOpen size={15} className="faint" />} />
          {collections.loading ? <Loading /> : !collection ? (
            <EmptyState title="No collection selected" desc={collections.data?.length ? 'Choose a collection to view saved requests.' : 'Collections are seeded with the demo workspace; create one through the API.'} />
          ) : (
            <div className="list">
              {collection.environment && (
                <div className="card-body small">
                  <div className="stat-label" style={{ marginBottom: 6 }}>Environment</div>
                  {Object.entries(collection.environment).map(([k, v]) => <div key={k} className="row small"><span className="faint mono">{k}</span><span className="mono truncate" style={{ marginLeft: 'auto' }}>{v}</span></div>)}
                </div>
              )}
              {collection.requests.map((r) => (
                <div key={r.id} className="list-row">
                  <span className="badge">{r.spec.method}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small" style={{ fontWeight: 550 }}>{r.name}</div>
                    <div className="faint truncate" style={{ fontSize: 10.5 }}>{r.spec.url}</div>
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => loadRequest(r.spec)}><Play size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {saveOpen && (
        <SaveCaseModal
          projects={projects.data ?? []}
          request={{ method: method as 'GET', url, headers: JSON.parse(headers || '{}'), body: body || undefined, assertions: { status: Number(expectedStatus), maxLatencyMs: Number(maxLatency), contains: contains || undefined } }}
          onClose={() => setSaveOpen(false)}
          onSaved={() => { setSaveOpen(false); setNotice('Saved as an API regression case.'); }}
        />
      )}
    </>
  );
}

function SaveCaseModal({ projects, request, onClose, onSaved }: { projects: Project[]; request: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const suites = useResource<TestSuite[]>(projectId ? `/suites?projectId=${projectId}` : null);
  const [suiteId, setSuiteId] = useState('');
  const [title, setTitle] = useState('API contract check');
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title="Save request as test case" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!suiteId || !title} onClick={async () => {
      try {
        await api('/cases', { method: 'POST', body: { suiteId, title, type: 'api', priority: 'high', request } });
        onSaved();
      } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save'); }
    }}><Plus size={13} /> Create case</button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Project"><select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Suite"><select className="select" value={suiteId} onChange={(e) => setSuiteId(e.target.value)}><option value="">Select suite</option>{suites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        </div>
        {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
      </div>
    </Modal>
  );
}
