/**
 * Multi-Model AI Playground + Model Comparison (Phase 40).
 *
 * Tabs:
 *   - Playground: send a prompt to a single provider/model and view the response
 *   - Compare: send the same prompt to multiple providers side by side
 *
 * Backend: POST /api/ai/playground/chat, POST /api/ai/playground/compare.
 */
import { useCallback, useEffect, useState } from 'react';
import { Send, Scale, ShieldAlert, Bot } from 'lucide-react';
import { api } from '../lib/api';
import { useToasts } from '../lib/hooks';
import { Card, CardHead, Field, Loading } from '../components/ui';

export default function AIPlayground() {
  const { push } = useToasts();
  const [tab, setTab] = useState<'playground' | 'compare'>('playground');
  const [providers, setProviders] = useState<Array<{ id: string; name: string; kind: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playground state
  const [pgForm, setPgForm] = useState({
    providerId: '',
    model: '',
    prompt: '',
    systemPrompt: '',
    timeoutMs: 30000,
  });
  const [pgResult, setPgResult] = useState<{ response: string | null; latencyMs: number; error?: string } | null>(null);
  const [pgRunning, setPgRunning] = useState(false);

  // Compare state
  const [cmpForm, setCmpForm] = useState({
    providerIds: [] as string[],
    model: '',
    prompt: '',
    systemPrompt: '',
    timeoutMs: 30000,
  });
  const [cmpResults, setCmpResults] = useState<Array<{
    providerId: string;
    providerKind: string;
    model: string;
    response: string | null;
    latencyMs: number;
    error?: string;
  }> | null>(null);
  const [cmpRunning, setCmpRunning] = useState(false);

  const loadProviders = useCallback(() => {
    setLoading(true);
    api<{ providers: any[] }>('/ai/providers')
      .then((d) => setProviders(d.providers))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const runPlayground = async () => {
    if (!pgForm.providerId || !pgForm.prompt) { push('Provider and prompt are required', 'bad'); return; }
    setPgRunning(true);
    setPgResult(null);
    try {
      const res = await api<{
        providerId: string; providerKind: string; model: string; prompt: string;
        response: string | null; latencyMs: number; error?: string;
      }>('/ai/playground/chat', {
        method: 'POST',
        body: {
          providerId: pgForm.providerId,
          model: pgForm.model,
          prompt: pgForm.prompt,
          systemPrompt: pgForm.systemPrompt || undefined,
          timeoutMs: pgForm.timeoutMs,
        },
      });
      setPgResult({ response: res.response, latencyMs: res.latencyMs, error: res.error });
      push(res.response ? 'Response received' : 'No response from provider', res.response ? 'good' : 'bad');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Playground request failed', 'bad');
    } finally {
      setPgRunning(false);
    }
  };

  const runCompare = async () => {
    if (cmpForm.providerIds.length === 0 || !cmpForm.prompt) { push('Select providers and enter a prompt', 'bad'); return; }
    setCmpRunning(true);
    setCmpResults(null);
    try {
      const res = await api<{ prompt: string; results: Array<{
        providerId: string; providerKind: string; model: string;
        response: string | null; latencyMs: number; error?: string;
      }> }>('/ai/playground/compare', {
        method: 'POST',
        body: {
          providerIds: cmpForm.providerIds,
          model: cmpForm.model,
          prompt: cmpForm.prompt,
          systemPrompt: cmpForm.systemPrompt || undefined,
          timeoutMs: cmpForm.timeoutMs,
        },
      });
      setCmpResults(res.results);
      const ok = res.results.filter((r) => r.response).length;
      push(`Compared ${res.results.length} provider(s), ${ok} responded`, ok > 0 ? 'good' : 'bad');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Comparison failed', 'bad');
    } finally {
      setCmpRunning(false);
    }
  };

  const providerLabel = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Multi-Model Playground</div>
          <div className="small faint">Send test prompts to providers and compare responses side by side.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${tab === 'playground' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('playground')}>
            <Bot size={13} /> Playground
          </button>
          <button className={`btn btn-sm ${tab === 'compare' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('compare')}>
            <Scale size={13} /> Compare
          </button>
        </div>
      </div>

      {error && <div className="badge badge-bad" style={{ padding: 8 }}><ShieldAlert size={12} /> {error}</div>}

      {loading && <Loading rows={3} />}

      {!loading && tab === 'playground' && (
        <Card>
          <CardHead title="Playground" desc="Send a test prompt to a single provider and inspect the response." />
          <div className="card-body stack" style={{ gap: 12 }}>
            <Field label="Provider">
              <select className="select" value={pgForm.providerId} onChange={(e) => setPgForm({ ...pgForm, providerId: e.target.value })}>
                <option value="">Select a provider…</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{providerLabel(p.id)} ({p.kind})</option>)}
              </select>
            </Field>
            <Field label="Model (API identifier)">
              <input className="input" value={pgForm.model} onChange={(e) => setPgForm({ ...pgForm, model: e.target.value })} placeholder="llama3.2" />
            </Field>
            <Field label="System prompt (optional)">
              <textarea className="input" value={pgForm.systemPrompt} onChange={(e) => setPgForm({ ...pgForm, systemPrompt: e.target.value })} rows={2} placeholder="You are a senior QA engineer…" />
            </Field>
            <Field label="Prompt">
              <textarea className="input" value={pgForm.prompt} onChange={(e) => setPgForm({ ...pgForm, prompt: e.target.value })} rows={4} placeholder="What test cases would you recommend for a login flow?" />
            </Field>
            <Field label="Timeout (ms)">
              <input className="input" type="number" value={pgForm.timeoutMs} onChange={(e) => setPgForm({ ...pgForm, timeoutMs: Number(e.target.value) || 30000 })} />
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm btn-primary" disabled={pgRunning || !pgForm.providerId || !pgForm.prompt} onClick={runPlayground}>
                <Send size={13} /> {pgRunning ? 'Sending…' : 'Send Prompt'}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setPgResult(null)}>Clear</button>
            </div>
            {pgResult && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{pgResult.error ? 'Error' : 'Response'}</div>
                  <div className="small faint">{pgResult.latencyMs} ms</div>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12, color: pgResult.error ? 'var(--bad)' : 'inherit' }}>
                  {pgResult.response ?? pgResult.error ?? '(empty)'}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {!loading && tab === 'compare' && (
        <Card>
          <CardHead title="Model Comparison" desc="Send the same prompt to multiple providers and compare responses and latency." />
          <div className="card-body stack" style={{ gap: 12 }}>
            <Field label="Providers">
              <select className="select" multiple size={4} value={cmpForm.providerIds} onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                setCmpForm({ ...cmpForm, providerIds: vals });
              }}>
                {providers.map((p) => <option key={p.id} value={p.id}>{providerLabel(p.id)} ({p.kind})</option>)}
              </select>
              <span className="hint">Hold Ctrl/Cmd to select multiple providers (max 5).</span>
            </Field>
            <Field label="Model (API identifier)">
              <input className="input" value={cmpForm.model} onChange={(e) => setCmpForm({ ...cmpForm, model: e.target.value })} placeholder="llama3.2" />
            </Field>
            <Field label="System prompt (optional)">
              <textarea className="input" value={cmpForm.systemPrompt} onChange={(e) => setCmpForm({ ...cmpForm, systemPrompt: e.target.value })} rows={2} placeholder="You are a senior QA engineer…" />
            </Field>
            <Field label="Prompt">
              <textarea className="input" value={cmpForm.prompt} onChange={(e) => setCmpForm({ ...cmpForm, prompt: e.target.value })} rows={4} placeholder="Generate a test case for user login…" />
            </Field>
            <Field label="Timeout (ms)">
              <input className="input" type="number" value={cmpForm.timeoutMs} onChange={(e) => setCmpForm({ ...cmpForm, timeoutMs: Number(e.target.value) || 30000 })} />
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm btn-primary" disabled={cmpRunning || cmpForm.providerIds.length === 0 || !cmpForm.prompt} onClick={runCompare}>
                <Scale size={13} /> {cmpRunning ? 'Comparing…' : 'Compare Providers'}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setCmpResults(null)}>Clear</button>
            </div>
            {cmpResults && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 8 }}>
                {cmpResults.map((r) => (
                  <div key={r.providerId} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{r.providerKind}</div>
                      <div className="small faint">{r.latencyMs} ms</div>
                    </div>
                    <div className="small faint">{providerLabel(r.providerId)} · {r.model}</div>
                    <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 11, color: r.error ? 'var(--bad)' : 'inherit', marginTop: 8, flex: 1, overflowY: 'auto', maxHeight: 300 }}>
                      {r.response ?? r.error ?? '(empty)'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
