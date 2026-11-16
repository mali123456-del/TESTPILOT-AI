import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Bug, CheckCircle2, FlaskConical, Layers, PlayCircle, ShieldCheck, Timer, TrendingUp } from 'lucide-react';
import type { Run, TestType } from '../../shared/types';
import { useResource } from '../lib/hooks';
import { duration, pct, when } from '../lib/api';
import { Badge, Bars, Card, CardHead, Donut, EmptyState, Field, Loading, PageHead, Progress, Ring, Sparkline, Stat } from '../components/ui';
import { useState } from 'react';

interface Dashboard {
  projects: number;
  suites: number;
  cases: number;
  runs: number;
  passRate: number;
  executed: number;
  failed: number;
  openBugs: number;
  criticalBugs: number;
  coverage: number;
  flaky: Array<{ caseId: string; title: string; passes: number; failures: number; rate: number }>;
  flakyRate: number;
  criticalFailures: number;
  readiness: number;
  readinessBreakdown: Array<{ label: string; weight: number; value: number }>;
  trend: Array<{ id: string; date: string; passRate: number; durationMs: number; total: number }>;
  durationTrend: Array<{ date: string; durationMs: number }>;
  coverageByType: Array<{ type: TestType; total: number; automated: number; executed: number }>;
  defects: { bySeverity: Array<{ severity: string; count: number }>; byStatus: Array<{ status: string; count: number }> };
  recentRuns: Run[];
  teamRuns: Array<{ actor: string; runs: number }>;
}

const TONE: Record<string, string> = { critical: 'var(--bad)', high: 'var(--warn)', medium: 'var(--info)', low: 'var(--faint)' };

export default function Overview() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const { data, loading, error } = useResource<Dashboard>(
    `/dashboard${buildQueryString({ startDate, endDate })}`,
    [startDate, endDate],
  );

  if (loading && !data) return <Loading rows={5} />;
  if (error) return <EmptyState title="Dashboard unavailable" desc={error} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        title="Quality overview"
        sub="A live read on product health, test stability and release readiness."
        actions={
          <>
            <Link className="btn btn-primary" to="/app/runs?new=1"><PlayCircle size={14} /> Run suite</Link>
          </>
        }
      />

      <div className="hero" style={{ marginBottom: 16 }}>
        <div className="split" style={{ alignItems: 'center' }}>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <Badge status="active">Live workspace</Badge>
              <Badge tone="info">Demo sample history</Badge>
            </div>
            <h1>Release readiness is <span className="gradient-text">{data.readiness}/100</span></h1>
            <p className="page-sub" style={{ marginTop: 6 }}>
              {data.criticalFailures === 0 ? 'No critical failures recorded. ' : `${data.criticalFailures} critical failure(s) need attention. `}
              {data.flaky.length} flaky case(s) · {data.openBugs} open defect(s) · {pct(data.coverage)} case coverage.
            </p>
            <div className="row" style={{ gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="badge badge-good"><CheckCircle2 size={11} /> {pct(data.passRate)} pass rate</span>
              <span className="badge badge-info"><Layers size={11} /> {data.cases} cases</span>
              <span className="badge"><Timer size={11} /> avg {duration(data.durationTrend.at(-1)?.durationMs)}</span>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <Field label="Start date">
                <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <Field label="End date">
                <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
            <Ring value={data.readiness} size={116} label="readiness" />
            <div className="stack" style={{ gap: 8, minWidth: 190 }}>
              {data.readinessBreakdown.map((b) => (
                <div key={b.label}>
                  <div className="row small" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">{b.label} <span className="faint">· {b.weight}%</span></span>
                    <b>{Math.round(b.value)}</b>
                  </div>
                  <Progress value={b.value} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat
          label="Pass rate"
          value={pct(data.passRate)}
          delta={<><TrendingUp size={12} /> {data.executed} executed results</>}
          tone={data.passRate >= 90 ? 'good' : 'warn'}
          statIcon="list-checks"
          statGlow="#7966ff"
          statIconColor="#a99aff"
        />
        <Stat
          label="Open defects"
          value={data.openBugs}
          delta={<><Bug size={12} /> {data.criticalBugs} critical</>}
          tone={data.openBugs ? 'warn' : 'good'}
          statIcon="bug"
          statGlow="#ff647c"
          statIconColor="#ff8293"
        />
        <Stat
          label="Flaky cases"
          value={data.flaky.length}
          delta={`${data.flakyRate}% of results unstable`}
          tone={data.flaky.length ? 'warn' : 'good'}
          statIcon="zap"
          statGlow="#7966ff"
          statIconColor="#a99aff"
        />
        <Stat
          label="Case coverage"
          value={pct(data.coverage)}
          delta={<><FlaskConical size={12} /> {data.suites} suites</>}
          statIcon="layers"
          statGlow="#52a7ff"
          statIconColor="#69b5ff"
        />
      </div>

      <div className="split" style={{ marginBottom: 16 }}>
        <Card>
          <CardHead title="Pass-rate trend" desc="Per completed run, most recent last" action={<Badge status="active">Live</Badge>} />
          <div className="card-body">
            <Sparkline data={data.trend.map((t) => t.passRate)} height={90} />
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
              <span className="small faint">Older</span>
              <span className="small muted">{data.trend.length} completed runs</span>
              <span className="small faint">Latest</span>
            </div>
            <div className="grid grid-3" style={{ marginTop: 18, gap: 12 }}>
              <div><div className="stat-label">Defects by severity</div><Donut segments={data.defects.bySeverity.map((d) => ({ label: d.severity, value: d.count, color: TONE[d.severity] }))} size={104} /></div>
              <div style={{ gridColumn: 'span 2' }}>
                <div className="stat-label" style={{ marginBottom: 8 }}>Execution duration (ms)</div>
                <Bars data={data.durationTrend.slice(-7).map((d) => ({ label: d.date.slice(5), value: Math.round(d.durationMs) }))} height={116} />
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHead title="Flaky watch" desc="Passes and failures in the same window" action={<Link className="btn btn-sm btn-ghost" to="/app/reports">Analytics <ArrowUpRight size={12} /></Link>} />
          {data.flaky.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={18} />} title="No flaky cases" desc="Recent runs are consistent." />
          ) : (
            <div className="list">
              {data.flaky.slice(0, 5).map((f) => (
                <div key={f.caseId} className="list-row">
                  <AlertTriangle size={15} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="small truncate" style={{ fontWeight: 550 }}>{f.title}</div>
                    <div className="faint" style={{ fontSize: 11 }}>{f.passes} pass · {f.failures} fail</div>
                  </div>
                  <span className="badge badge-warn" style={{ marginLeft: 'auto' }}>{f.rate}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="stat-label" style={{ marginBottom: 10 }}>Coverage by test type</div>
            <div className="stack" style={{ gap: 9 }}>
              {data.coverageByType.slice(0, 6).map((c) => (
                <div key={c.type}>
                  <div className="row small" style={{ justifyContent: 'space-between' }}>
                    <span className="muted" style={{ textTransform: 'capitalize' }}>{c.type.replace('-', ' ')}</span>
                    <span className="faint">{c.executed}/{c.total}</span>
                  </div>
                  <Progress value={c.total ? (c.executed / c.total) * 100 : 0} />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHead
          title="Recent runs"
          desc="Every execution is reproducible from its stored case definitions"
          action={<Link className="btn btn-sm" to="/app/runs">Execution center</Link>}
        />
        {data.recentRuns.length === 0 ? (
          <EmptyState title="No runs yet" desc="Trigger your first suite to populate the dashboard." action={<Link className="btn btn-primary btn-sm" to="/app/runs?new=1">Run tests</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Run</th><th>Project</th><th>Status</th><th>Passed</th><th>Failed</th><th>Duration</th><th>When</th><th /></tr>
              </thead>
              <tbody>
                {data.recentRuns.map((r) => (
                  <tr key={r.id}>
                    <td className="mono small">{r.id.slice(0, 12)}</td>
                    <td className="small">{r.projectId.replace('prj_', '')}</td>
                    <td><Badge status={r.status} /></td>
                    <td className="small">{r.summary.passed}/{r.summary.total}</td>
                    <td className="small" style={{ color: r.summary.failed ? 'var(--bad)' : undefined }}>{r.summary.failed + r.summary.error}</td>
                    <td className="small">{duration(r.durationMs)}</td>
                    <td className="small faint">{when(r.finishedAt ?? r.startedAt)}</td>
                    <td><Link className="btn btn-sm btn-ghost" to={`/app/runs?run=${r.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function buildQueryString(params: { startDate?: string; endDate?: string; projectId?: string }): string {
  const qs = new URLSearchParams();
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  if (params.projectId) qs.set('projectId', params.projectId);
  return qs.toString() ? `?${qs.toString()}` : '';
}
