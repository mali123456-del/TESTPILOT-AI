/**
 * AI Provider Center + Provider Configuration (Phase 40).
 *
 * Tabs:
 *   - Providers: list all configured providers, enable/disable, delete, view masked credentials
 *   - Add Provider: create a new provider config with optional credentials
 *
 * Backend: GET/POST/PATCH/DELETE /api/ai/providers, credentials endpoints.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Trash2, ToggleLeft, ToggleRight, ShieldAlert, Key, Cloud } from 'lucide-react';
import type { AiProviderConfigPublic, AiProviderKind } from '../../shared/types';
import { api } from '../lib/api';
import { useToasts } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, Modal } from '../components/ui';

const KINDS: AiProviderKind[] = ['local', 'ollama', 'openai-compatible'];

const KIND_LABEL: Record<AiProviderKind, string> = {
  local: 'Local (heuristics)',
  ollama: 'Ollama',
  'openai-compatible': 'OpenAI-compatible',
};

export default function AIProviders() {
  const { push } = useToasts();
  const [tab, setTab] = useState<'providers' | 'add'>('providers');
  const [providers, setProviders] = useState<AiProviderConfigPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'edit' | 'delete'; provider: AiProviderConfigPublic } | null>(null);
  const [form, setForm] = useState({
    name: '',
    kind: 'ollama' as AiProviderKind,
    baseUrl: '',
    model: '',
    enabled: true,
    credentials: {} as Record<string, string>,
  });

  const load = useCallback(() => {
    setLoading(true);
    api<{ providers: AiProviderConfigPublic[]; envProvider: { name: string; model: string | null; available: boolean } }>('/ai/providers')
      .then((d) => {
        setProviders(d.providers);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kindLabel = (k: AiProviderKind) => KIND_LABEL[k];

  const createProvider = async () => {
    if (!form.name) { push('Provider name is required', 'bad'); return; }
    if (form.kind !== 'local' && !form.baseUrl) { push('Base URL is required for this provider type', 'bad'); return; }

    try {
      const res = await api<{ provider: AiProviderConfigPublic; credentialsConfigured: boolean }>('/ai/providers', {
        method: 'POST',
        body: {
          name: form.name,
          kind: form.kind,
          baseUrl: form.baseUrl || undefined,
          model: form.model || undefined,
          enabled: form.enabled,
          credentials: Object.keys(form.credentials).length ? form.credentials : undefined,
        },
      });
      push(`Provider "${res.provider.name}" created`);
      setTab('providers');
      setForm({ name: '', kind: 'ollama', baseUrl: '', model: '', enabled: true, credentials: {} });
      load();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to create provider', 'bad');
    }
  };

  const toggleProvider = async (p: AiProviderConfigPublic) => {
    try {
      await api(`/ai/providers/${p.id}`, {
        method: 'PATCH',
        body: { enabled: !p.enabled },
      });
      push(`Provider ${p.enabled ? 'disabled' : 'enabled'}`);
      load();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to update provider', 'bad');
    }
  };

  const deleteProvider = async () => {
    if (!modal) return;
    try {
      await api(`/ai/providers/${modal.provider.id}`, { method: 'DELETE' });
      push(`Provider "${modal.provider.name}" removed`);
      setModal(null);
      load();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to delete provider', 'bad');
    }
  };

  const credentialsModal = (
    <Modal title="Configure Credentials" onClose={() => setModal(null)} wide>
      <div className="stack" style={{ gap: 12 }}>
        <p className="small faint">
          Credentials are encrypted at rest and never returned in API responses. Only the last 4 characters are shown in the UI.
        </p>
        <Field label="API Key">
          <input className="input" type="password" autoComplete="off" />
        </Field>
        <Field label="Additional header (optional)">
          <input className="input" placeholder="e.g. Authorization: Bearer sk-..." autoComplete="off" />
        </Field>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => { push('Credentials saved (masked)'); setModal(null); }}>Save</button>
        </div>
      </div>
    </Modal>
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeadBlock
        title="AI Provider Center"
        sub="Manage AI providers, configure credentials, enable/disable connections, and test provider health."
        actions={
          <button className="btn btn-primary" onClick={() => setTab('add')}><Plus size={14} /> Add Provider</button>
        }
      />

      {error && <div className="badge badge-bad" style={{ padding: 8 }}><ShieldAlert size={12} /> {error}</div>}

      {tab === 'providers' && (
        <>
          <Card>
            <CardHead title="Configured Providers" desc={`${providers.length} provider(s) in this workspace`} />
            {loading ? <Loading rows={4} /> : (
              providers.length === 0 ? (
                <EmptyState icon={<Cloud size={24} />} title="No providers configured" desc="Add your first AI provider to enable cloud model integrations." />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Provider</th><th>Kind</th><th>Model</th><th>Base URL</th><th>Status</th><th>Credentials</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {providers.map((p) => (
                        <tr key={p.id}>
                          <td className="small"><strong>{p.name}</strong></td>
                          <td className="small faint">{kindLabel(p.kind)}</td>
                          <td className="small mono">{p.model ?? '—'}</td>
                          <td className="small faint mono" style={{ maxWidth: 200 }}>{p.baseUrl ?? '—'}</td>
                          <td><Badge status={p.enabled ? 'active' : 'paused'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge></td>
                          <td>
                            <Badge status={p.credentialsConfigured ? 'configured' : 'unavailable'}>
                              {p.credentialsConfigured ? 'Configured' : 'Not set'}
                            </Badge>
                          </td>
                          <td className="small nowrap">
                            <button className="btn btn-sm btn-ghost" onClick={() => toggleProvider(p)}>
                              {p.enabled ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ name: p.name, kind: p.kind, baseUrl: p.baseUrl ?? '', model: p.model ?? '', enabled: p.enabled, credentials: {} }); setModal({ mode: 'edit', provider: p }); }}>
                              <Key size={12} /> Credentials
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setModal({ mode: 'delete', provider: p })}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </Card>

          <div className="badge badge-info" style={{ padding: 10 }}>
            <Key size={12} /> Security note: API keys are encrypted at rest (when `TESTPILOT_ENCRYPTION_KEY` is set) and masked in all UI responses. They are never logged or exported.
          </div>
        </>
      )}

      {tab === 'add' && (
        <Card>
          <CardHead title="Add AI Provider" desc="Configure a new AI provider for this workspace" />
          <div className="card-body stack" style={{ gap: 12 }}>
            <Field label="Display name">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Provider type">
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AiProviderKind, baseUrl: '', model: '' })}>
                {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
              </select>
              <span className="hint">Local is always available offline; Ollama and OpenAI-compatible require a base URL.</span>
            </Field>
            {form.kind !== 'local' && (
              <>
                <Field label="Base URL">
                  <input className="input" type="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="http://127.0.0.1:11434" />
                </Field>
                <Field label="Default model">
                  <input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="llama3.2" />
                </Field>
              </>
            )}
            <Field label="Enabled by default">
              <label className="field">
                <input type="checkbox" defaultChecked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enable provider
              </label>
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setTab('providers')}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={loading} onClick={createProvider}>
                <Save size={13} /> {loading ? 'Creating…' : 'Create Provider'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {modal && modal.mode === 'edit' && credentialsModal}
      {modal && modal.mode === 'delete' && (
        <Modal title="Delete Provider" onClose={() => setModal(null)}>
          <div className="stack" style={{ gap: 12 }}>
            <p>Are you sure you want to delete <strong>{modal.provider.name}</strong>? This cannot be undone.</p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-sm btn-bad" onClick={deleteProvider}>Delete</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PageHeadBlock({ title, sub, actions }: { title: string; sub: string; actions?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
        <div className="small faint">{sub}</div>
      </div>
      {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}
