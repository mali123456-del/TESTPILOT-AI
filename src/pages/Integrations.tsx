import { useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, Plug, XCircle } from 'lucide-react';
import type { Integration } from '../../shared/types';
import { api, when } from '../lib/api';
import { useAuth, useResource } from '../lib/hooks';
import { Badge, Card, CardHead, CopyButton, Loading, PageHead, Tabs } from '../components/ui';

export default function Integrations() {
  const { auth } = useAuth();
  const { data, loading } = useResource<{ items: Integration[]; playwright: { available: boolean; reason: string } }>('/integrations');
  const [tab, setTab] = useState('All');
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const canManage = ['owner', 'admin'].includes(auth?.user.role ?? '');

  const categories = ['All', 'repository', 'ci', 'framework', 'issue-tracker', 'webhook'];
  const items = (data?.items ?? []).filter((i) => tab === 'All' || i.category === tab);

  const test = async (i: Integration) => {
    setTesting(i.id);
    try {
      const res = await api<{ ok: boolean; detail: string }>(`/integrations/${i.id}/test`, { method: 'POST' });
      setNotice(`${i.name}: ${res.detail}`);
    } catch (err) {
      setNotice(`${i.name}: ${err instanceof Error ? err.message : 'test failed'}`);
    } finally {
      setTesting(null);
    }
  };

  const rotate = async () => {
    try {
      const res = await api<{ token: string }>('/workspace/token', { method: 'POST' });
      setToken(res.token);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to create token');
    }
  };

  if (loading && !data) return <Loading rows={4} />;

  return (
    <>
      <PageHead
        title="Integrations"
        sub="Official APIs and documented interfaces only. Unavailable adapters are labelled instead of faked."
        actions={<Badge tone={data?.playwright.available ? 'good' : 'warn'}>Playwright {data?.playwright.available ? 'ready' : 'not installed'}</Badge>}
      />
      {notice && <div className="badge badge-info" style={{ padding: 8, marginBottom: 12, display: 'block', whiteSpace: 'normal' }}>{notice}</div>}

      <Tabs tabs={categories} active={tab} onChange={setTab} />

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        {items.map((i) => (
          <Card key={i.id} className="card-pad">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}><Plug size={16} /></div>
              <div>
                <div className="card-title">{i.name}</div>
                <div className="faint small" style={{ textTransform: 'capitalize' }}>{i.category.replace('-', ' ')}</div>
              </div>
              <span style={{ marginLeft: 'auto' }}><Badge status={i.status} /></span>
            </div>
            <p className="small muted" style={{ margin: '10px 0', minHeight: 46 }}>{i.detail}</p>
            <div className="row">
              <button className="btn btn-sm" onClick={() => void test(i)} disabled={testing === i.id || i.status === 'unavailable'}>
                {testing === i.id ? 'Testing…' : 'Test connection'}
              </button>
              {i.name === 'GitHub' && <a className="btn btn-sm btn-ghost" href={i.config?.repo ? `https://github.com/${i.config.repo}` : 'https://github.com'} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open</a>}
            </div>
          </Card>
        ))}
      </div>

      <div className="split">
        <Card>
          <CardHead title="CI inbound webhook" desc="Trigger runs from any pipeline with a workspace bearer token." action={canManage ? <button className="btn btn-sm" onClick={() => void rotate()}><KeyRound size={13} /> New token</button> : undefined} />
          <div className="card-body stack" style={{ gap: 12 }}>
            {token ? (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row"><span className="badge badge-warn">shown once</span><CopyButton value={token} /></div>
                <pre className="code">{token}</pre>
                <p className="hint">Store it in your CI secret store. It is hashed at rest and cannot be displayed again.</p>
              </div>
            ) : (
              <p className="small muted">Rotate a token to authenticate the inbound hook. Existing tokens are invalidated.</p>
            )}
            <pre className="code">{`curl -X POST http://127.0.0.1:4318/api/hooks/run \\
  -H "Authorization: Bearer \$TESTPILOT_TOKEN" \\
  -H "content-type: application/json" \\
  -d '{"projectId":"prj_orbit","suiteId":"ste_1"}'`}</pre>
            <p className="hint">Returns 202 with a runId and a status URL. Rate limits and allowlists still apply.</p>
          </div>
        </Card>
        <Card>
          <CardHead title="Browser automation" desc="Optional heavy dependency" />
          <div className="card-body stack" style={{ gap: 10 }}>
            <div className="row">{data?.playwright.available ? <CheckCircle2 size={16} style={{ color: 'var(--good)' }} /> : <XCircle size={16} style={{ color: 'var(--warn)' }} />}<span className="small">{data?.playwright.reason}</span></div>
            <pre className="code">{`npm i -D playwright\nnpx playwright install chromium`}</pre>
            <p className="hint">Without Playwright, browser cases are recorded as <b>skipped</b> with this exact reason. They are never reported as passing.</p>
          </div>
        </Card>
      </div>
      <span className="faint small" style={{ display: 'block', marginTop: 14 }}>Last configuration update: {when(itemDate(items))}</span>
    </>
  );
}

function itemDate(items: Integration[]): string | undefined {
  return items[0]?.createdAt;
}
