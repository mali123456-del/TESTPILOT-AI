import { useState } from 'react';
import { CreditCard, ScrollText, Settings, UserPlus, Users } from 'lucide-react';
import type { AuditEvent, Entitlements, Plan, Workspace } from '../../shared/types';
import { api, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, Modal, PageHead, Tabs } from '../components/ui';

interface WorkspacePayload {
  workspace: Workspace;
  members: Array<{ id: string; name: string; email: string; role: string; createdAt: string }>;
  entitlements: Entitlements;
  usage: { runsThisMonth: number; projects: number; seats: number };
}

const PLANS: Array<{ id: Plan; name: string; price: string; blurb: string }> = [
  { id: 'free', name: 'Free', price: '$0', blurb: '2 seats · 2 projects · 200 runs / month' },
  { id: 'pro', name: 'Pro', price: '$29', blurb: '10 seats · 15 projects · 5,000 runs / month' },
  { id: 'ultimate', name: 'Ultimate', price: '$79', blurb: '50 seats · 100 projects · agent workforce' },
  { id: 'business', name: 'Business', price: '$199', blurb: '500 seats · SSO architecture · audit export' },
];

export default function Team() {
  const { auth, setWorkspace } = useAuth();
  const payload = useResource<WorkspacePayload>('/workspace');
  const audit = useResource<AuditEvent[]>('/audit');
  const [tab, setTab] = useState('Members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = auth?.user.role === 'owner';
  const canManage = ['owner', 'admin'].includes(auth?.user.role ?? '');

  if (payload.loading && !payload.data) return <Loading rows={4} />;
  const data = payload.data;
  if (!data) return <EmptyState title="Workspace unavailable" desc={payload.error ?? undefined} />;

  const changePlan = async (plan: Plan) => {
    if (!window.confirm(`Switch to the ${plan} plan? This build simulates plan changes and takes no payment.`)) return;
    setBusy(true);
    try {
      const res = await api<{ workspace: Workspace; entitlements: Entitlements; note: string }>('/billing/plan', { method: 'POST', body: { plan } });
      setWorkspace(res.workspace, res.entitlements);
      setNotice(res.note);
      payload.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Plan change failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Team & settings" sub="Seats, workspace policy, plan entitlements and the audit trail." actions={<Badge tone="info">{data.usage.seats}/{data.entitlements.seats} seats</Badge>} />
      {notice && <div className="badge badge-info" style={{ padding: 8, marginBottom: 12, display: 'block', whiteSpace: 'normal' }}>{notice}</div>}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Card className="stat"><div className="stat-label">Plan</div><div className="stat-value" style={{ textTransform: 'capitalize', fontSize: 22 }}>{data.workspace.plan}</div></Card>
        <Card className="stat"><div className="stat-label">Projects</div><div className="stat-value">{data.usage.projects}<span className="faint" style={{ fontSize: 14 }}>/{data.entitlements.projects}</span></div></Card>
        <Card className="stat"><div className="stat-label">Runs this month</div><div className="stat-value" style={{ fontSize: 22 }}>{data.usage.runsThisMonth}<span className="faint" style={{ fontSize: 14 }}>/{data.entitlements.runsPerMonth}</span></div></Card>
        <Card className="stat"><div className="stat-label">AI assists / day</div><div className="stat-value" style={{ fontSize: 22 }}>{data.entitlements.aiAssistsPerDay}</div></Card>
      </div>

      <Tabs tabs={['Members', 'Workspace', 'Billing', 'Audit log']} active={tab} onChange={setTab} />

      {tab === 'Members' && (
        <Card>
          <CardHead
            title={`${data.members.length} member(s)`}
            desc="Roles: owner, admin, QA lead, tester and viewer (read-only)."
            action={canManage ? <button className="btn btn-sm btn-primary" onClick={() => setInviteOpen(true)}><UserPlus size={13} /> Invite</button> : undefined}
          />
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td className="small" style={{ fontWeight: 550 }}>{m.name}</td>
                    <td className="small muted">{m.email}</td>
                    <td><Badge tone="info">{m.role.replace('_', ' ')}</Badge></td>
                    <td className="small faint">{when(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'Workspace' && <WorkspaceSettings workspace={data.workspace} canManage={canManage && isOwner} onSaved={(w, e) => { setWorkspace(w, e); payload.reload(); setNotice('Workspace settings saved.'); }} />}

      {tab === 'Billing' && (
        <div className="stack">
          <div className="price-grid">
            {PLANS.map((p) => {
              const current = data.workspace.plan === p.id;
              return (
                <div key={p.id} className={`price ${current ? 'featured' : ''}`}>
                  <div className="row"><b>{p.name}</b>{current && <span className="badge badge-good" style={{ marginLeft: 'auto' }}>current</span>}</div>
                  <div className="price-amount">{p.price}<span>/mo</span></div>
                  <div className="small muted">{p.blurb}</div>
                  <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                    {data.entitlements.features.slice(0, 3).map((f) => <div key={f} className="small faint">· {f}</div>)}
                  </div>
                  <button className="btn" style={{ marginTop: 'auto' }} disabled={current || !isOwner || busy} onClick={() => void changePlan(p.id)}>
                    <CreditCard size={13} /> {current ? 'Current plan' : 'Switch plan'}
                  </button>
                </div>
              );
            })}
          </div>
          <Card>
            <CardHead title="Billing architecture" desc="Commercial readiness without live payment activation" />
            <div className="card-body stack" style={{ gap: 8 }}>
              <p className="small muted">Plans configure entitlements (seats, projects, run volume, AI assists) on the workspace record. Switching is immediate and audited.</p>
              <p className="small muted">No payment provider is contacted and no charge is created. Connect Stripe or Paddle in a later release once commercial approval is granted.</p>
              <div className="row"><Badge tone="warn">payments disabled</Badge><Badge tone="info">entitlements enforced server-side</Badge></div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'Audit log' && (
        <Card>
          <CardHead title="Audit trail" desc="Authentication, configuration, approvals and execution events." action={<ScrollText size={15} className="faint" />} />
          {audit.error ? <EmptyState title="Restricted" desc="Audit logs require QA lead privileges or higher." /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>IP</th><th>When</th></tr></thead>
                <tbody>
                  {audit.data?.map((a) => (
                    <tr key={a.id}>
                      <td className="small"><Badge tone="info">{a.action}</Badge></td>
                      <td className="small">{a.actor}</td>
                      <td className="small muted" style={{ maxWidth: 300 }}><div className="truncate">{a.target ?? '—'}</div></td>
                      <td className="small faint mono">{a.ip ?? '—'}</td>
                      <td className="small faint nowrap">{when(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!audit.data?.length && <EmptyState icon={<Users size={18} />} title="No audit events" desc="Activity will appear here." />}
            </div>
          )}
        </Card>
      )}

      {inviteOpen && (
        <InviteModal onClose={() => setInviteOpen(false)} onSaved={() => { setInviteOpen(false); payload.reload(); setNotice('Member added.'); }} />
      )}
    </>
  );
}

function WorkspaceSettings({ workspace, canManage, onSaved }: { workspace: Workspace; canManage: boolean; onSaved: (w: Workspace, e: Entitlements) => void }) {
  const [form, setForm] = useState({ name: workspace.name, aiApprovalsRequired: workspace.aiApprovalsRequired, allowedHosts: workspace.allowedHosts.join(', ') });
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="split">
      <Card>
        <CardHead title="Workspace policy" desc="Applies to every new run and AI action." action={<Settings size={15} className="faint" />} />
        <div className="card-body stack" style={{ gap: 14 }}>
          <Field label="Workspace name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canManage} /></Field>
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={form.aiApprovalsRequired} onChange={(e) => setForm({ ...form, aiApprovalsRequired: e.target.checked })} disabled={!canManage} />
            Require human approval before AI-generated cases or defects are written
          </label>
          <Field label="Allowed hosts" hint="Comma separated. Targets outside this list are rejected by every engine.">
            <input className="input" value={form.allowedHosts} onChange={(e) => setForm({ ...form, allowedHosts: e.target.value })} disabled={!canManage} />
          </Field>
          <button
            className="btn btn-primary"
            disabled={!canManage}
            onClick={async () => {
              try {
                const res = await api<{ workspace: Workspace; entitlements: Entitlements }>('/workspace', { method: 'PATCH', body: { name: form.name, aiApprovalsRequired: form.aiApprovalsRequired, allowedHosts: form.allowedHosts.split(',').map((h) => h.trim()).filter(Boolean) } });
                onSaved(res.workspace, res.entitlements);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Unable to save');
              }
            }}
          >
            Save settings
          </button>
          {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
        </div>
      </Card>
      <Card>
        <CardHead title="Security posture" desc="Enabled by default on this build" />
        <div className="card-body stack" style={{ gap: 8 }}>
          {['scrypt password hashing', 'HTTP-only session cookies', 'CSRF double-submit tokens', 'Role-based access control', 'Per-IP and per-session rate limits', 'Strict CSP and frame denial', 'Workspace-scoped queries', 'Audit logging', 'Allowlisted outbound targets'].map((f) => (
            <div key={f} className="row small"><span style={{ color: 'var(--good)' }}>✓</span> {f}</div>
          ))}
          <p className="hint">This app is designed for a single-node deployment. Add TLS termination and a reverse proxy for production.</p>
        </div>
      </Card>
    </div>
  );
}

function InviteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'tester', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Add a team member" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !form.name || !form.email || form.password.length < 8} onClick={async () => {
      setBusy(true);
      try {
        await api('/workspace/members', { method: 'POST', body: form });
        onSaved();
      } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add member'); } finally { setBusy(false); }
    }}>Add member</button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <p className="small muted">This deployment uses local accounts. Share the temporary password through a secure channel and ask the member to change it.</p>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Role">
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {['admin', 'qa_lead', 'tester', 'viewer'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Temporary password" hint="Minimum 8 characters."><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
        {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
      </div>
    </Modal>
  );
}
