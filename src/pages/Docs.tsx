import { BookOpen, Boxes, ShieldCheck, Terminal } from 'lucide-react';
import { Badge, Card, CardHead, PageHead } from '../components/ui';

const ENGINES = [
  ['Unit / integration', 'Sandboxed vm runner with expect() matchers, assertion counting and a hard 8s cap. No filesystem, network or async.'],
  ['API / contract', 'Real server-side HTTP with status, latency, header, substring and JSON-path assertions.'],
  ['Accessibility', 'Static WCAG-oriented structural analysis: alt text, labels, landmarks, heading order, tabindex and frame titles.'],
  ['Visual regression', 'Normalised DOM fingerprint comparison against a stored baseline (not pixel diffing).'],
  ['Database', 'Fixture-driven referential integrity, uniqueness, required fields and minimum row counts.'],
  ['Performance', 'Bounded load profiles with p50/p95/p99, throughput and error rate; max 200 requests / 20 workers.'],
  ['Security', 'Passive header, HSTS, CSP, cookie-flag, CORS and disclosure checks. Non-intrusive.'],
  ['Browser E2E / cross-browser', 'Playwright adapter when installed. Otherwise the case is skipped with an explicit reason — never faked.'],
];

export default function Docs() {
  return (
    <>
      <PageHead title="Documentation" sub="How TESTPILOT AI actually works, what is verified, and what is intentionally not bundled." actions={<Badge tone="info"><BookOpen size={11} /> v1.0.0</Badge>} />

      <div className="split" style={{ marginBottom: 16 }}>
        <Card>
          <CardHead title="Quick start" desc="Local development" action={<Terminal size={15} className="faint" />} />
          <div className="card-body stack" style={{ gap: 10 }}>
            <pre className="code">{`npm install\nnpm run dev\n# web  http://127.0.0.1:4317\n# api  http://127.0.0.1:4318\n\n# production\nnpm run build\nnpm start`}</pre>
            <p className="small muted">The first boot seeds a demo workspace (<b>demo@testpilot.ai / Demo1234!</b>). Seeded run history is illustrative sample data; runs you trigger execute against real targets.</p>
            <p className="small muted">Set <code>TESTPILOT_SEED=0</code> for an empty instance, and configure <code>.env</code> from <code>.env.example</code>.</p>
          </div>
        </Card>
        <Card>
          <CardHead title="Architecture" desc="Single-node, low-resource by design" action={<Boxes size={15} className="faint" />} />
          <div className="card-body stack" style={{ gap: 8 }}>
            <div className="small"><b>Web:</b> React 18 + TypeScript + Vite, custom design system, lazy routes, one icon dependency.</div>
            <div className="small"><b>API:</b> Express with JSON-file persistence, atomic writes and workspace-scoped queries.</div>
            <div className="small"><b>Engines:</b> isolated runner modules with per-case timeouts and a concurrency cap of 3.</div>
            <div className="small"><b>AI:</b> provider registry — deterministic local engine by default; Ollama / OpenAI-compatible optional.</div>
            <div className="small"><b>Realtime:</b> Server-Sent Events for live run progress.</div>
            <div className="small"><b>Scheduler:</b> 30s evaluator with a two-concurrent-run safeguard for low-spec machines.</div>
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <CardHead title="Test engines" desc="What each result actually means" />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th style={{ width: 200 }}>Engine</th><th>Implementation</th></tr></thead>
            <tbody>{ENGINES.map(([engine, detail]) => <tr key={engine}><td className="small" style={{ fontWeight: 600 }}>{engine}</td><td className="small muted">{detail}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <div className="split" style={{ marginBottom: 16 }}>
        <Card>
          <CardHead title="API reference (selected)" desc="All routes are workspace-scoped and require a session plus CSRF for writes." />
          <div className="card-body">
            <pre className="code">{`POST /api/auth/login          { email, password }
GET  /api/auth/me             session + csrfToken + entitlements
GET  /api/dashboard           quality metrics + readiness breakdown
GET  /api/projects            workspace projects
POST /api/runs                { projectId, suiteId | caseIds[] }
GET  /api/runs/:id/stream     SSE live results
POST /api/ai/generate-cases   { requirement, count, suiteId }
POST /api/ai/agents/:id/run   scoped, rate-limited agents
POST /api/request/send        server-side API execution
POST /api/performance         bounded load profile
POST /api/security/scan       passive hardening scan
POST /api/reports/generate    quality / execution / release
GET  /api/reports/:id/export  ?format=json|html
POST /api/hooks/run           Bearer workspace token (CI)
GET  /api/health              public liveness + version`}</pre>
          </div>
        </Card>
        <Card>
          <CardHead title="Security model" desc="What is implemented" action={<ShieldCheck size={15} style={{ color: 'var(--good)' }} />} />
          <div className="card-body stack" style={{ gap: 7 }}>
            {[
              'scrypt password hashing with per-user salt',
              'HttpOnly, SameSite=Lax session cookies',
              'CSRF double-submit token on every mutation',
              'RBAC: owner, admin, QA lead, tester, viewer',
              'Rate limits: login, API and AI endpoints',
              'CSP, frame denial, nosniff, referrer policy',
              'URL allowlists and cloud-metadata blocking',
              'Unit sandbox has no require/process/network',
              'Audit log with actor, action, IP and target',
              'Secrets via environment only; tokens hashed at rest',
            ].map((s) => <div key={s} className="row small"><span style={{ color: 'var(--good)' }}>✓</span> {s}</div>)}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Known limitations" desc="Stated honestly so you can plan around them" />
        <div className="card-body stack" style={{ gap: 8 }}>
          {[
            'Single-node JSON storage is not suitable for multi-tenant scale; migrate to Postgres for production.',
            'Playwright is optional and not bundled; browser cases report skipped until installed.',
            'Visual regression compares normalised DOM fingerprints, not screenshots/pixels.',
            'PDF export uses the browser print dialog; no server-side PDF renderer is bundled.',
            'Database tests validate JSON fixtures, not live SQL connections.',
            'AI providers beyond the local engine require configuration and may incur third-party costs.',
            'Tauri desktop packaging requires a Rust toolchain and is documented but not built in this environment.',
            'Schedules run while the server process is alive; there is no distributed queue.',
          ].map((l) => <div key={l} className="row small" style={{ alignItems: 'flex-start' }}><span style={{ color: 'var(--warn)' }}>•</span> {l}</div>)}
        </div>
      </Card>
    </>
  );
}
