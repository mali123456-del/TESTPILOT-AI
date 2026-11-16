/**
 * AI Model Registry + Model Discovery (Phase 40).
 *
 * Tabs:
 *   - Registry: list registered models with verified capabilities, edit entries
 *   - Discovery: discover models from a configured provider
 *
 * Backend: GET/POST/PATCH /api/ai/models, POST /api/ai/models/discover.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, RefreshCw, ShieldAlert, Database, Terminal } from 'lucide-react';
import type { AiModel } from '../../shared/types';
import { api } from '../lib/api';
import { useToasts } from '../lib/hooks';
import { Badge, Card, EmptyState, Field, Loading, Modal } from '../components/ui';

export default function AIModels() {
  const { push } = useToasts();
  const [tab, setTab] = useState<'registry' | 'discover'>('registry');
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<{ providerId: string; providerKind: string; discovered: any[]; health: any } | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; model?: AiModel } | null>(null);
  const [form, setForm] = useState({
    providerId: '',
    name: '',
    identifier: '',
    type: 'chat' as 'chat' | 'completion' | 'embedding',
    version: '',
    contextWindow: '',
    capabilities: '',
    inputFormats: 'text',
    outputFormats: 'text',
    toolCalling: false,
    streaming: false,
    enabled: true,
    benchmarkEligible: false,
  });
  const [providers, setProviders] = useState<Array<{ id: string; name: string; kind: string }>>([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<{ models: AiModel[] }>('/ai/models'),
      api<{ providers: any[] }>('/ai/providers').then((d) => d.providers),
    ])
      .then(([modelsRes, providersRes]) => {
        setModels(modelsRes.models);
        setProviders(providersRes);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const modelRows = useMemo(() => {
    return models.map((m) => {
      const prov = providers.find((p) => p.id === m.providerId);
      return (
        <tr key={m.id}>
          <td className="small"><strong>{m.name}</strong><div className="faint mono" style={{ fontSize: 10 }}>{m.identifier}</div></td>
          <td className="small faint">{prov?.name ?? m.providerId}</td>
          <td className="small">{m.type}</td>
          <td className="small">{m.capabilities.map((c) => <span key={c} className="badge" style={{ fontSize: 10, margin: 2 }}>{c}</span>)}</td>
          <td><Badge status={m.toolCalling ? 'active' : 'unavailable'}>{m.toolCalling ? 'Yes' : 'No'}</Badge></td>
          <td><Badge status={m.streaming ? 'active' : 'unavailable'}>{m.streaming ? 'Yes' : 'No'}</Badge></td>
          <td><Badge status={m.benchmarkEligible ? 'active' : 'unavailable'}>{m.benchmarkEligible ? 'Yes' : 'No'}</Badge></td>
          <td><Badge status={m.enabled ? 'active' : 'paused'}>{m.enabled ? 'Enabled' : 'Disabled'}</Badge></td>
          <td className="small nowrap">
            <button className="btn btn-sm btn-ghost" onClick={() => {
              setForm({
                providerId: m.providerId,
                name: m.name,
                identifier: m.identifier,
                type: m.type,
                version: m.version ?? '',
                contextWindow: String(m.contextWindow ?? ''),
                capabilities: m.capabilities.join(', '),
                inputFormats: m.inputFormats.join(', '),
                outputFormats: m.outputFormats.join(', '),
                toolCalling: m.toolCalling,
                streaming: m.streaming,
                enabled: m.enabled,
                benchmarkEligible: m.benchmarkEligible,
              });
              setModal({ mode: 'edit', model: m });
            }}>
              <Save size={12} />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => deleteModel(m.id)}>
              <Database size={12} />
            </button>
          </td>
        </tr>
      );
    });
  }, [models, providers]);

  const saveModel = async () => {
    if (!form.name || !form.identifier || !form.providerId) {
      push('Name, identifier and provider are required', 'bad');
      return;
    }
    try {
      const body: any = {
        providerId: form.providerId,
        name: form.name,
        identifier: form.identifier,
        type: form.type,
        contextWindow: form.contextWindow ? Number(form.contextWindow) : undefined,
        capabilities: form.capabilities.split(',').map((s) => s.trim()).filter(Boolean),
        inputFormats: form.inputFormats.split(',').map((s) => s.trim()).filter(Boolean),
        outputFormats: form.outputFormats.split(',').map((s) => s.trim()).filter(Boolean),
        toolCalling: form.toolCalling,
        streaming: form.streaming,
        enabled: form.enabled,
        benchmarkEligible: form.benchmarkEligible,
      };
      if (modal?.mode === 'edit' && modal.model) {
        await api(`/ai/models/${modal.model.id}`, { method: 'PATCH', body });
        push('Model updated');
      } else {
        await api('/ai/models', { method: 'POST', body });
        push('Model registered');
      }
      setModal(null);
      load();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to save model', 'bad');
    }
  };

  const deleteModel = async (id: string) => {
    if (!confirm('Delete this model registry entry?')) return;
    try {
      const model = models.find((m) => m.id === id);
      if (!model) return;
      await api(`/ai/models/${id}`, { method: 'PATCH', body: { enabled: false } });
      push('Model disabled');
      load();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to disable model', 'bad');
    }
  };

  const discover = async () => {
    if (!form.providerId) { push('Select a provider first', 'bad'); return; }
    setDiscovering(true);
    try {
      const res = await api<{ discovered: any[]; providerId: string; providerKind: string; health: any }>('/ai/models/discover', {
        method: 'POST',
        body: { providerId: form.providerId },
      });
      setDiscovery(res);
      push(`Discovered ${res.discovered.length} model(s)`);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Discovery failed', 'bad');
    } finally {
      setDiscovering(false);
    }
  };

  const registerDiscovered = async (m: any) => {
    try {
      await api('/ai/models', {
        method: 'POST',
        body: {
          providerId: form.providerId,
          name: m.identifier,
          identifier: m.identifier,
          type: m.type,
          capabilities: m.capabilities,
          inputFormats: m.inputFormats,
          outputFormats: m.outputFormats,
          toolCalling: m.toolCalling,
          streaming: m.streaming,
          enabled: true,
          benchmarkEligible: false,
        },
      });
      push(`Registered ${m.identifier}`);
      load();
      setDiscovery(null);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to register model', 'bad');
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>AI Model Registry</div>
          <div className="small faint">Register, discover, and manage AI models with verified capabilities.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setTab('registry')}>Registry</button>
          <button className={`btn btn-sm ${tab === 'discover' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('discover')}>Discovery</button>
        </div>
      </div>

      {error && <div className="badge badge-bad" style={{ padding: 8 }}><ShieldAlert size={12} /> {error}</div>}

      {tab === 'registry' && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{models.length} model(s) registered</div>
            <button className="btn btn-sm btn-primary" onClick={() => {
              setForm({ providerId: '', name: '', identifier: '', type: 'chat', version: '', contextWindow: '', capabilities: '', inputFormats: 'text', outputFormats: 'text', toolCalling: false, streaming: false, enabled: true, benchmarkEligible: false });
              setModal({ mode: 'add' });
            }}>
              <Plus size={13} /> Add Model
            </button>
          </div>
          {loading ? <Loading rows={4} /> : (
            models.length === 0 ? (
              <EmptyState icon={<Database size={24} />} title="No models registered" desc="Register models manually or discover them from a configured provider." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Model</th><th>Provider</th><th>Type</th><th>Capabilities</th><th>Tools</th><th>Streaming</th><th>Benchmark</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>{modelRows}</tbody>
                </table>
              </div>
            )
          )}
        </Card>
      )}

      {tab === 'discover' && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Model Discovery</div>
            <button className="btn btn-sm btn-ghost" onClick={() => { setDiscovery(null); load(); }}>Refresh providers</button>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            <Field label="Provider">
              <select className="select" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
                <option value="">Select a provider…</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>
                ))}
              </select>
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" disabled={discovering || !form.providerId} onClick={discover}>
                <RefreshCw size={13} /> {discovering ? 'Discovering…' : 'Discover Models'}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={load}>Reload</button>
            </div>
            {discovery && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{discovery.discovered.length} model(s) discovered from {discovery.providerKind}</div>
                <div className="small faint">Health: {discovery.health.status}</div>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="table">
                    <thead><tr><th>Model</th><th>Type</th><th>Capabilities</th><th>Action</th></tr></thead>
                    <tbody>
                      {discovery.discovered.map((m, i) => (
                        <tr key={i}>
                          <td className="small mono">{m.identifier}</td>
                          <td className="small">{m.type}</td>
                          <td className="small">{m.capabilities.join(', ')}</td>
                          <td>
                            <button className="btn btn-sm btn-primary" onClick={() => registerDiscovered(m)}>Register</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {discovery && discovery.discovered.length === 0 && (
              <EmptyState icon={<Terminal size={24} />} title="No models discovered" desc="The provider reported no models or discovery failed." />
            )}
          </div>
        </Card>
      )}

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Register Model' : 'Edit Model'} onClose={() => setModal(null)} wide>
          <div className="card-body stack" style={{ gap: 12 }}>
            <Field label="Provider">
              <select className="select" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
                <option value="">Select a provider…</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>
                ))}
              </select>
            </Field>
            <Field label="Model name">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Model identifier (API name)">
              <input className="input" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder="llama3.2" />
            </Field>
            <Field label="Type">
              <select className="select" value={form.type as string} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                <option value="chat">Chat</option>
                <option value="completion">Completion</option>
                <option value="embedding">Embedding</option>
              </select>
            </Field>
            <Field label="Context window (tokens, optional)">
              <input className="input" type="number" value={form.contextWindow} onChange={(e) => setForm({ ...form, contextWindow: e.target.value })} />
              <span className="hint">Only enter when verified from provider docs or discovery.</span>
            </Field>
            <Field label="Capabilities (comma-separated)">
              <input className="input" value={form.capabilities} onChange={(e) => setForm({ ...form, capabilities: e.target.value })} placeholder="text-generation, reasoning, code" />
              <span className="hint">Only list capabilities verified through testing or documentation.</span>
            </Field>
            <Field label="Input formats">
              <input className="input" value={form.inputFormats} onChange={(e) => setForm({ ...form, inputFormats: e.target.value })} />
            </Field>
            <Field label="Output formats">
              <input className="input" value={form.outputFormats} onChange={(e) => setForm({ ...form, outputFormats: e.target.value })} />
            </Field>
            <Field label="Tool calling">
              <label className="field">
                <input type="checkbox" defaultChecked={form.toolCalling} onChange={(e) => setForm({ ...form, toolCalling: e.target.checked })} /> Verified tool-calling support
              </label>
            </Field>
            <Field label="Streaming">
              <label className="field">
                <input type="checkbox" defaultChecked={form.streaming} onChange={(e) => setForm({ ...form, streaming: e.target.checked })} /> Verified streaming support
              </label>
            </Field>
            <Field label="Benchmark eligible">
              <label className="field">
                <input type="checkbox" defaultChecked={form.benchmarkEligible} onChange={(e) => setForm({ ...form, benchmarkEligible: e.target.checked })} /> Can be used as a benchmark target
              </label>
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={loading || discovering} onClick={saveModel}>
                <Save size={13} /> {modal.mode === 'add' ? 'Register' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
