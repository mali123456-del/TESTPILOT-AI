import { useState } from 'react';
import { Bot, Check, PlayCircle, ShieldAlert, X } from 'lucide-react';
import type { AgentDefinition, AgentRun, Approval, Project } from '../../shared/types';
import { api, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, EmptyState, Field, Loading, Modal, PageHead, Tabs } from '../components/ui';

type AgentWithMeta = AgentDefinition & { runs: number; lastRun?: AgentRun };

export default function Agents() {
  const { auth } = useAuth();
  const [tab, setTab] = useState('Workforce');
  const agents = useResource<AgentWithMeta[]>('/ai/agents');
  const approvals = useResource<Approval[]>('/ai/approvals');
  const agentRuns = useResource<AgentRun[]>('/ai/agent-runs');
  const projects = useResource<Project[]>('/projects');
  const [active, setActive] = useState<AgentWithMeta | null>(null);
  const [output, setOutput] = useState<{ agent: string; text: string; approvalId?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canAct = auth?.user.role !== 'viewer';

  const decide = async (approval: Approval, decision: 'approved' | 'rejected') => {
    await api(`/ai/approvals/${approval.id}`, { method: 'POST', body: { decision } }).catch((e) => setNotice(e.message));
    approvals.reload();
    setNotice(`Approval ${decision}.`);
  };

  if (agents.loading && !agents.data) return <Loading rows={4} />;

  return (
    <>
      <PageHead
        title="Agent workforce"
        sub="Specialised agents with scoped permissions, hourly limits and an approval gate for anything that writes."
        actions={<span className="badge badge-info"><ShieldAlert size={11} /> human-in-the-loop by default</span>}
      />
      {notice && <div className="badge badge-good" style={{ padding: 8, marginBottom: 12, display: 'block' }}>{notice}</div>}

      <Tabs tabs={['Workforce', 'Approvals', 'Run history']} active={tab} onChange={setTab} />

      {tab === 'Workforce' && (
        <div className="grid grid-3">
          {agents.data?.map((a) => (
            <Card key={a.id} className="card-pad">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}><Bot size={17} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="card-title">{a.name}</div>
                  <div className="faint small">{a.role}</div>
                </div>
                <span style={{ marginLeft: 'auto' }}><Badge status={a.requiresApproval ? 'awaiting_approval' : 'active'}>{a.requiresApproval ? 'approval' : 'autonomous'}</Badge></span>
              </div>
              <p className="small muted" style={{ margin: '10px 0', minHeight: 52 }}>{a.description}</p>
              <div className="row small faint" style={{ marginBottom: 10 }}>
                <span>{a.runs} run(s)</span>
                <span>·</span>
                <span>limit {a.maxRunsPerHour}/h</span>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {a.scopes.map((s) => <span key={s} className="badge" style={{ fontSize: 9.5 }}>{s}</span>)}
              </div>
              <button className="btn btn-sm btn-primary" style={{ width: '100%' }} onClick={() => setActive(a)} disabled={!canAct}>
                <PlayCircle size={13} /> Run agent
              </button>
            </Card>
          ))}
        </div>
      )}

      {tab === 'Approvals' && (
        <Card>
          <CardHead title="Approval queue" desc="Consequential actions pause here until a QA lead or admin decides." />
          {approvals.data?.length ? (
            <div className="list">
              {approvals.data.map((a) => (
                <div key={a.id} className="list-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row"><Badge status={a.status} /><span className="badge">{a.kind}</span></div>
                    <div className="small" style={{ fontWeight: 600, marginTop: 6 }}>{a.title}</div>
                    <div className="faint small">requested by {a.requestedBy} · {when(a.createdAt)}{a.decidedBy ? ` · decided by ${a.decidedBy}` : ''}</div>
                  </div>
                  {a.status === 'pending' && auth?.user.role !== 'viewer' && ['owner', 'admin', 'qa_lead'].includes(auth?.user.role ?? '') && (
                    <div className="row">
                      <button className="btn btn-sm btn-primary" onClick={() => void decide(a, 'approved')}><Check size={13} /> Approve</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => void decide(a, 'rejected')}><X size={13} /> Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Check size={18} />} title="Nothing waiting" desc="Generated cases and defect drafts will appear here for review." />
          )}
        </Card>
      )}

      {tab === 'Run history' && (
        <Card>
          <CardHead title="Agent run history" desc="Every invocation is recorded for audit." />
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Agent</th><th>Status</th><th>Input</th><th>Output</th><th>When</th></tr></thead>
              <tbody>
                {agentRuns.data?.map((r) => (
                  <tr key={r.id}>
                    <td className="small" style={{ fontWeight: 550 }}>{r.agentId}</td>
                    <td><Badge status={r.status} /></td>
                    <td className="small muted" style={{ maxWidth: 200 }}><div className="truncate">{r.input || '—'}</div></td>
                    <td className="small" style={{ maxWidth: 420 }}><div className="truncate">{r.output ?? '—'}</div></td>
                    <td className="small faint nowrap">{when(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!agentRuns.data?.length && <EmptyState title="No agent runs yet" desc="Pick an agent to get started." />}
          </div>
        </Card>
      )}

      {active && (
        <AgentModal
          agent={active}
          projects={projects.data ?? []}
          onClose={() => setActive(null)}
          onDone={(res) => {
            setActive(null);
            setOutput({ agent: active.name, text: res.output ?? 'No output', approvalId: res.approvalId });
            agentRuns.reload();
            approvals.reload();
          }}
        />
      )}

      {output && (
        <Modal title={`${output.agent} output`} onClose={() => setOutput(null)} wide footer={<button className="btn" onClick={() => setOutput(null)}>Close</button>}>
          <div className="stack" style={{ gap: 12 }}>
            <pre className="code" style={{ whiteSpace: 'pre-wrap', maxHeight: 460 }}>{output.text}</pre>
            {output.approvalId && (
              <div className="badge badge-warn" style={{ padding: 8, whiteSpace: 'normal' }}>
                This agent requested approval. Open the Approvals tab to approve or reject the artefact.
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function AgentModal({ agent, projects, onClose, onDone }: { agent: AgentWithMeta; projects: Project[]; onClose: () => void; onDone: (r: AgentRun & { approvalId?: string }) => void }) {
  const [input, setInput] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<AgentRun & { approvalId?: string }>(`/ai/agents/${agent.id}/run`, { method: 'POST', body: { input, projectId } });
      onDone(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Run ${agent.name}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => void run()} disabled={busy}>{busy ? 'Running…' : 'Run agent'}</button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <p className="small muted">{agent.description}</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>{agent.scopes.map((s) => <span key={s} className="badge">{s}</span>)}</div>
        <Field label="Task or context" hint="Short, specific instructions produce the most useful artefacts.">
          <textarea className="textarea" style={{ minHeight: 100 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Describe the feature, endpoint or release goal…" />
        </Field>
        <Field label="Project">
          <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
      </div>
    </Modal>
  );
}
