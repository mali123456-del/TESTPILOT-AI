/**
 * Intelligent Routing Settings (Phase 40).
 *
 * Configure which provider handles each task category, with fallback,
 * timeout, and retry settings. Routing decisions are logged without
 * sensitive data.
 *
 * Backend: GET/PATCH /api/ai/routing.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, ShieldAlert, Zap, GitBranch } from 'lucide-react';
import type { AiRoutingRule } from '../../shared/types';
import { api } from '../lib/api';
import { useAuth, useToasts } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, Modal } from '../components/ui';

export default function AIRouting() {
  const { auth } = useAuth();
  const { push } = useToasts();
  const [config, setConfig] = useState<{ defaultProviderId: string | null; rules: AiRoutingRule[]; timeoutMs: number; maxRetries: number } | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; kind: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; rule?: AiRoutingRule } | null>(null);
  const [form, setForm] = useState<{ taskCategory: string; providerId: string; fallbackProviderId: string; enabled: boolean }>({ taskCategory: '', providerId: '', fallbackProviderId: '', enabled: true });
  const [defaultProvider, setDefaultProvider] = useState<string | null>(null);
  const [timeoutMs, setTimeoutMs] = useState('30000');
  const [maxRetries, setMaxRetries] = useState('2');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<{ config: any }>('/ai/routing'),
      api<{ providers: any[] }>('/ai/providers'),
    ])
      .then(([routingRes, providersRes]) => {
        const c = routingRes.config;
        setConfig({
          defaultProviderId: c.defaultProviderId,
          rules: c.rules,
          timeoutMs: c.timeoutMs,
          maxRetries: c.maxRetries,
        });
        setDefaultProvider(c.defaultProviderId);
        setTimeoutMs(String(c.timeoutMs));
        setMaxRetries(String(c.maxRetries));
        setProviders(providersRes.providers);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = async () => {
    try {
      await api('/ai/routing', {
        method: 'PATCH',
        body: {
          defaultProvider: defaultProvider,
          timeoutMs: Number(timeoutMs) || 30000,
          maxRetries: Number(maxRetries) || 2,
          rules: config?.rules ?? [],
        },
      });
      push('Routing configuration saved');
      load();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to save routing config', 'bad');
    }
  };

  const saveRule = async () => {
    if (!form.taskCategory || !form.providerId) { push('Task category and provider are required', 'bad'); return; }
    try {
      const rules = (config?.rules ?? []).map((r) => (modal?.mode === 'edit' && modal.rule && r.id === modal.rule.id ? { ...r, ...form, createdAt: r.createdAt } : r));
      if (modal?.mode === 'add') {
        rules.push({
          id: `rule_${Date.now()}`,
          workspaceId: auth!.user.workspaceId,
          taskCategory: form.taskCategory,
          providerId: form.providerId,
          fallbackProviderId: form.fallbackProviderId || undefined,
          enabled: form.enabled,
          createdAt: new Date().toISOString(),
        });
      }
      await api('/ai/routing', {
        method: 'PATCH',
        body: {
          defaultProviderId: config?.defaultProviderId ?? null,
          timeoutMs: config?.timeoutMs ?? 30000,
          maxRetries: config?.maxRetries ?? 2,
          rules,
        },
      });
      push('Routing rule saved');
      setModal(null);
      load();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to save rule', 'bad');
    }
  };

  const deleteRule = (id: string) => {
    if (!confirm('Delete this routing rule?')) return;
    const rules = (config?.rules ?? []).filter((r) => r.id !== id);
    api('/ai/routing', {
      method: 'PATCH',
      body: { defaultProviderId: config?.defaultProviderId ?? null, timeoutMs: config?.timeoutMs ?? 30000, maxRetries: config?.maxRetries ?? 2, rules },
    }).then(() => { push('Rule deleted'); load(); }).catch((err) => push(err.message, 'bad'));
  };

  const providerLabel = (id: string | undefined | null) => {
    if (!id) return '—';
    return providers.find((p) => p.id === id)?.name ?? id;
  };

  const categoryLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1).replace(/-/g, ' ');

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Intelligent Routing Settings</div>
          <div className="small faint">Route AI tasks to providers by category, with fallback and timeout controls.</div>
        </div>
      </div>

      {error && <div className="badge badge-bad" style={{ padding: 8 }}><ShieldAlert size={12} /> {error}</div>}

      {loading ? <Loading rows={3} /> : (
        <>
          <Card>
            <CardHead title="Default Routing" desc="Default provider used when no category rule matches." />
            <div className="card-body stack" style={{ gap: 12 }}>
              <Field label="Default provider">
                <select className="select" value={defaultProvider ?? ''} onChange={(e) => setDefaultProvider(e.target.value || null)}>
                  <option value="">None (local fallback)</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{providerLabel(p.id)} ({p.kind})</option>)}
                </select>
              </Field>
              <Field label="Timeout (ms)">
                <input className="input" type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
              </Field>
              <Field label="Max retries">
                <input className="input" type="number" value={maxRetries} onChange={(e) => setMaxRetries(e.target.value)} />
              </Field>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-sm btn-primary" onClick={saveConfig}><Save size={13} /> Save Defaults</button>
              </div>
              <div className="badge badge-info" style={{ padding: 8 }}>
                <Zap size={12} /> Routing falls back to the local provider when the selected provider is unavailable. Fallback decisions are logged without credentials.
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Task Category Rules" desc="Map task categories to preferred providers with optional fallbacks." />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{config?.rules.length ?? 0} rule(s)</div>
              <button className="btn btn-sm btn-primary" onClick={() => { setForm({ taskCategory: '', providerId: '', fallbackProviderId: '', enabled: true }); setModal({ mode: 'add' }); }}>
                <Plus size={13} /> Add Rule
              </button>
            </div>
            {config?.rules.length === 0 ? (
              <EmptyState icon={<GitBranch size={24} />} title="No routing rules" desc="Add a rule to route a task category to a specific provider." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Task Category</th><th>Provider</th><th>Fallback</th><th>Enabled</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    { (config?.rules ?? []).map((r) => (
                      <tr key={r.id}>
                        <td className="small">{categoryLabel(r.taskCategory)}</td>
                        <td className="small">{providerLabel(r.providerId)}</td>
                        <td className="small faint">{providerLabel(r.fallbackProviderId)}</td>
                        <td><Badge status={r.enabled ? 'active' : 'paused'} /></td>
                        <td className="small nowrap">
                          <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ taskCategory: r.taskCategory, providerId: r.providerId, fallbackProviderId: r.fallbackProviderId ?? '', enabled: r.enabled }); setModal({ mode: 'edit', rule: r }); }}>
                            <Save size={12} />
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => deleteRule(r.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {modal && (
            <Modal title={modal.mode === 'add' ? 'Add Routing Rule' : 'Edit Routing Rule'} onClose={() => setModal(null)} wide>
              <div className="card-body stack" style={{ gap: 12 }}>
                <Field label="Task category">
                  <input className="input" value={form.taskCategory} onChange={(e) => setForm({ ...form, taskCategory: e.target.value })} placeholder="case-generation" />
                  <span className="hint">e.g. case-generation, failure-triage, assistant, benchmark</span>
                </Field>
                <Field label="Provider">
                  <select className="select" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
                    <option value="">Select a provider…</option>
                    {providers.map((p) => <option key={p.id} value={p.id}>{providerLabel(p.id)} ({p.kind})</option>)}
                  </select>
                </Field>
                <Field label="Fallback provider (optional)">
                  <select className="select" value={form.fallbackProviderId ?? ''} onChange={(e) => setForm({ ...form, fallbackProviderId: e.target.value })}>
                    <option value="">None</option>
                    {providers.map((p) => <option key={p.id} value={p.id}>{providerLabel(p.id)} ({p.kind})</option>)}
                  </select>
                </Field>
                <Field label="Enabled">
                  <label className="field">
                    <input type="checkbox" defaultChecked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enable rule
                  </label>
                </Field>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={saveRule}><Save size={13} /> Save Rule</button>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
