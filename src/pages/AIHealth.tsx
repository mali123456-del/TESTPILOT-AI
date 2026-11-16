/**
 * Provider Health Monitor + Connection Testing Center (Phase 40).
 *
 * Tabs:
 *   - Health: current health status of all configured providers
 *   - Connection Test: run a full connection test (DNS, endpoint, auth, model, valid response)
 *
 * Backend: GET/POST /api/ai/providers/:id/health, POST /api/ai/providers/:id/test.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert, Zap, Clock, Terminal, Activity } from 'lucide-react';
import type { ProviderHealthResult, ProviderConnectionTest } from '../../shared/types';
import { api } from '../lib/api';
import { useToasts } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading } from '../components/ui';

export default function AIHealth() {
  const { push } = useToasts();
  const [tab, setTab] = useState<'health' | 'test'>('health');
  const [providers, setProviders] = useState<Array<{ id: string; name: string; kind: string; baseUrl?: string }>>([]);
  const [healthResults, setHealthResults] = useState<Record<string, ProviderHealthResult>>({});
  const [testResult, setTestResult] = useState<ProviderConnectionTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedForTest, setSelectedForTest] = useState<string>('');

  const load = useCallback(() => {
    setLoading(true);
    api<{ providers: any[] }>('/ai/providers')
      .then((d) => {
        setProviders(d.providers);
        return Promise.all(
          d.providers.map((p) =>
            api<ProviderHealthResult>(`/ai/providers/${p.id}/health`).then((h) => ({ id: p.id, health: h })).catch((e) => ({ id: p.id, health: { providerId: p.id, status: 'unknown' as const, checkedAt: new Date().toISOString(), error: e.message } as ProviderHealthResult }))
          )
        );
      })
      .then((results) => {
        const map: Record<string, ProviderHealthResult> = {};
        for (const r of results) map[r.id] = r.health;
        setHealthResults(map);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const healthRows = useMemo(() => {
    return providers.map((p) => {
      const h = healthResults[p.id];
      return (
        <tr key={p.id}>
          <td className="small"><strong>{p.name}</strong></td>
          <td className="small faint">{p.kind}</td>
          <td><Badge status={h?.status ?? 'unknown'}>{h?.status ?? 'unknown'}</Badge></td>
          <td className="small mono">{h?.latencyMs ?? '—'} ms</td>
          <td className="small faint">{h?.checkedAt ? new Date(h.checkedAt).toLocaleTimeString() : '—'}</td>
          <td className="small faint">{h?.error ?? '—'}</td>
          <td>
            <button className="btn btn-sm btn-ghost" onClick={() => runHealth(p.id)}>
              <RefreshCw size={12} />
            </button>
          </td>
        </tr>
      );
    });
  }, [providers, healthResults]);

  const runHealth = async (id: string) => {
    try {
      const h = await api<ProviderHealthResult>(`/ai/providers/${id}/health`);
      setHealthResults((prev) => ({ ...prev, [id]: h }));
      push(`Health check: ${h.status}`);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Health check failed', 'bad');
    }
  };

  const runConnectionTest = async () => {
    if (!selectedForTest) { push('Select a provider to test', 'bad'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api<ProviderConnectionTest>(`/ai/providers/${selectedForTest}/test`, { method: 'POST' });
      setTestResult(res);
      push(`Connection test: ${res.error ? 'failed' : 'passed'}`, res.error ? 'bad' : 'good');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Connection test failed', 'bad');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Provider Health Monitor</div>
          <div className="small faint">Check provider availability, authentication, and model reachability.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${tab === 'health' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('health')}>
            <Activity size={13} /> Health
          </button>
          <button className={`btn btn-sm ${tab === 'test' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('test')}>
            <Terminal size={13} /> Connection Test
          </button>
        </div>
      </div>

      {error && <div className="badge badge-bad" style={{ padding: 8 }}><ShieldAlert size={12} /> {error}</div>}

      {tab === 'health' && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{providers.length} provider(s)</div>
            <button className="btn btn-sm btn-primary" disabled={loading} onClick={load}>
              <RefreshCw size={13} /> {loading ? 'Checking…' : 'Check All'}
            </button>
          </div>
          {loading ? <Loading rows={3} /> : (
            providers.length === 0 ? (
              <EmptyState icon={<ShieldAlert size={24} />} title="No providers" desc="Configure a provider first in the Provider Center." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Provider</th><th>Kind</th><th>Status</th><th>Latency</th><th>Last Checked</th><th>Error</th><th>Action</th></tr>
                  </thead>
                  <tbody>{healthRows}</tbody>
                </table>
              </div>
            )
          )}
        </Card>
      )}

      {tab === 'test' && (
        <Card>
          <CardHead title="Connection Testing Center" desc="Run a full connection test: DNS, endpoint, authentication, model availability, and valid response." />
          <div className="card-body stack" style={{ gap: 12 }}>
            <Field label="Provider">
              <select className="select" value={selectedForTest} onChange={(e) => setSelectedForTest(e.target.value)}>
                <option value="">Select a provider…</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>
                ))}
              </select>
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm btn-primary" disabled={testing || !selectedForTest} onClick={runConnectionTest}>
                <Zap size={13} /> {testing ? 'Testing…' : 'Run Connection Test'}
              </button>
            </div>
            {testResult && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{testResult.error ? 'Test Failed' : 'Test Passed'}</div>
                  <div className="small faint">{new Date(testResult.testedAt).toLocaleTimeString()}</div>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      <tr><td className="small">DNS reachable</td><td><Badge status={testResult.dnsReachable ? 'active' : 'unavailable'} /></td></tr>
                      <tr><td className="small">Endpoint available</td><td><Badge status={testResult.endpointAvailable ? 'active' : 'unavailable'} /></td></tr>
                      <tr><td className="small">Authentication</td><td><Badge status={testResult.authenticationOk ? 'active' : 'unavailable'} /></td></tr>
                      <tr><td className="small">Model available</td><td><Badge status={testResult.modelAvailable ? 'active' : 'unavailable'} /></td></tr>
                      <tr><td className="small">Valid response</td><td><Badge status={testResult.validResponse ? 'active' : 'unavailable'} /></td></tr>
                      <tr><td className="small">Streaming</td><td><Badge status={testResult.streamingSupported ? 'active' : 'unavailable'} /></td></tr>
                      <tr><td className="small">Structured output</td><td><Badge status={testResult.structuredOutputSupported ? 'active' : 'unavailable'} /></td></tr>
                      <tr><td className="small">Timeout</td><td className="small mono">{testResult.timeoutMs} ms</td></tr>
                      {testResult.error && <tr><td className="small faint">Error</td><td className="small faint">{testResult.error}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {testResult && !testResult.error && !testResult.validResponse && (
              <div className="badge badge-warn" style={{ padding: 8, marginTop: 8 }}>
                <Clock size={12} /> Endpoint responded but no valid content returned — check model configuration.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
