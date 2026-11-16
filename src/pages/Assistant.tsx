import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Send, Bot, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, Field, Loading, PageHead } from '../components/ui';
import type { Project, TestSuite } from '../../shared/types';

interface GeneratedCase {
  title: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  steps: string[];
  expected: string;
  rationale: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
}

const SUGGESTIONS = [
  'What should we test next?',
  'Summarise our coverage gaps',
  'Which tests are flaky?',
  'Are we ready to release?',
];

export default function Assistant() {
  const { auth } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'chat' | 'generate'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'I am TESTPILOT AI. I answer from your workspace evidence and can draft executable test cases.\n\nAsk about coverage, failures, flaky cases or release readiness — or switch to Generate to turn a requirement into a test plan.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (params.get('generate') === '1') setTab('generate');
  }, [params]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setBusy(true);
    try {
      const res = await api<{ answer: string; provider: string }>('/ai/chat', { method: 'POST', body: { question } });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer, provider: res.provider }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: err instanceof Error ? err.message : 'The assistant is unavailable.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="AI testing assistant"
        sub="Provider-independent intelligence. The local engine works fully offline; optional Ollama or OpenAI-compatible endpoints can be enabled by environment configuration."
        actions={<span className="badge badge-info"><Sparkles size={11} /> {auth?.workspace.plan} plan · local-first</span>}
      />
      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Assistant chat</button>
        <button className={`tab ${tab === 'generate' ? 'active' : ''}`} onClick={() => setTab('generate')}>Generate test cases</button>
      </div>

      {tab === 'chat' ? (
        <div className="split">
          <Card className="chat">
            <div className="chat-log">
              {messages.map((m, i) => (
                <div key={i}>
                  <div className={`bubble ${m.role}`}>{m.content}</div>
                  {m.provider && <div className="faint" style={{ fontSize: 10.5, marginTop: 4 }}>provider: {m.provider}</div>}
                </div>
              ))}
              {busy && <div className="bubble assistant">Thinking…</div>}
              <div ref={endRef} />
            </div>
            <div className="chat-input">
              <input
                className="input"
                placeholder="Ask about coverage, failures or readiness…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send()}
                aria-label="Message the assistant"
              />
              <button className="btn btn-primary" onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Send message"><Send size={15} /></button>
            </div>
          </Card>
          <div className="stack">
            <Card>
              <CardHead title="Suggested prompts" desc="Grounded in your workspace data" />
              <div className="stack" style={{ padding: 12, gap: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => void send(s)}>{s}</button>
                ))}
              </div>
            </Card>
            <Card>
              <CardHead title="How this works" />
              <div className="card-body stack" style={{ gap: 10 }}>
                <p className="small muted">The local provider is deterministic and offline. It never sends workspace data to a third party.</p>
                <p className="small muted">Consequential actions — adding cases, filing defects — require human approval in the Agent workforce queue.</p>
                <div className="row small"><Badge status="available">no paid API required</Badge></div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <GeneratePanel />
      )}
    </>
  );
}

function GeneratePanel() {
  const projects = useResource<Project[]>('/projects');
  const [projectId, setProjectId] = useState('');
  const [requirement, setRequirement] = useState(
    'Customers can apply a maximum of two coupons at checkout. The combined discount must never exceed 30% of the cart subtotal.',
  );
  const [count, setCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const [cases, setCases] = useState<GeneratedCase[]>([]);
  const [meta, setMeta] = useState<{ provider: string; approvalId?: string; requiresApproval?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [suiteId, setSuiteId] = useState('');

  useEffect(() => {
    if (!projectId && projects.data?.[0]) setProjectId(projects.data[0].id);
  }, [projects.data, projectId]);

  useEffect(() => {
    if (!projectId) return;
    api<TestSuite[]>(`/suites?projectId=${projectId}`).then((s) => {
      setSuites(s);
      setSuiteId(s[0]?.id ?? '');
    }).catch(() => undefined);
  }, [projectId]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setCases([]);
    try {
      const res = await api<{ cases: GeneratedCase[]; provider: string; approvalId?: string; requiresApproval: boolean }>('/ai/generate-cases', {
        method: 'POST',
        body: { requirement, count, suiteId, requestApproval: meta?.requiresApproval ?? undefined },
      });
      setCases(res.cases);
      setMeta({ provider: res.provider, approvalId: res.approvalId, requiresApproval: res.requiresApproval });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  const approve = async (decision: 'approved' | 'rejected') => {
    if (!meta?.approvalId) return;
    await api(`/ai/approvals/${meta.approvalId}`, { method: 'POST', body: { decision } });
    setMeta({ ...meta, approvalId: undefined });
    setCases([]);
  };

  return (
    <div className="split">
      <Card>
        <CardHead title="Requirement → test cases" desc="Drafts are stored as manual cases after approval so a human owns every addition." />
        <div className="card-body stack" style={{ gap: 14 }}>
          <Field label="Requirement" hint="Describe behaviour, constraints and acceptance expectations.">
            <textarea className="textarea" style={{ minHeight: 110 }} value={requirement} onChange={(e) => setRequirement(e.target.value)} />
          </Field>
          <div className="grid grid-2" style={{ gap: 12 }}>
            <Field label="Project">
              <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Target suite">
              <select className="select" value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>
                {suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Number of cases">
            <input className="input" type="range" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            <span className="hint">{count} cases</span>
          </Field>
          <button className="btn btn-primary" onClick={() => void generate()} disabled={busy || requirement.length < 10 || !suiteId}>
            <Sparkles size={14} /> {busy ? 'Generating…' : 'Generate cases'}
          </button>
          {error && <div className="badge badge-bad" style={{ padding: 8 }}>{error}</div>}
          {meta && (
            <div className="card card-pad small">
              <div className="row"><Badge status="available">provider: {meta.provider}</Badge></div>
              {meta.approvalId ? (
                <>
                  <p className="muted" style={{ margin: '8px 0' }}>Approval required before these drafts enter <b>{suites.find((s) => s.id === suiteId)?.name}</b>.</p>
                  <div className="row">
                    <button className="btn btn-sm btn-primary" onClick={() => void approve('approved')}><Check size={13} /> Approve {cases.length}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => void approve('rejected')}><X size={13} /> Reject</button>
                  </div>
                </>
              ) : (
                <p className="muted" style={{ marginTop: 8 }}>No approval was requested for this batch. Drafts remain unreviewed until added manually.</p>
              )}
            </div>
          )}
        </div>
      </Card>
      <Card>
        <CardHead title="Draft preview" desc="Review before approval" action={<span className="badge">{cases.length} drafts</span>} />
        <div className="stack" style={{ padding: 14, gap: 10, maxHeight: 620, overflowY: 'auto' }}>
          {cases.length === 0 && !busy && <div className="empty small"><Bot size={20} style={{ margin: '0 auto 8px' }} />Generate a batch to preview structured cases.</div>}
          {busy && <Loading rows={3} />}
          {cases.map((c, i) => (
            <div key={`${c.title}-${i}`} className="card card-pad">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Badge tone="info">{c.type}</Badge>
                <span className="small" style={{ fontWeight: 600, flex: 1 }}>{c.title}</span>
                <Badge status={c.priority} />
              </div>
              <ol className="small muted" style={{ margin: '8px 0 6px', paddingLeft: 18 }}>
                {c.steps?.map((s, j) => <li key={j}>{s}</li>)}
              </ol>
              <div className="small"><b>Expected:</b> {c.expected}</div>
              <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{c.rationale}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
