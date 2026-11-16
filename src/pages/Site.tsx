import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Bot, Check, Chrome, Github, Globe2, Layers, Lock, Monitor, PlayCircle, ShieldCheck, Sparkles, Terminal, TestTube2, Zap } from 'lucide-react';
import { useState } from 'react';

const FEATURES = [
  { icon: TestTube2, title: 'Real execution engines', copy: 'Unit, API, accessibility, visual, data, performance and security engines — each with honest evidence and clear limits.' },
  { icon: Sparkles, title: 'AI test intelligence', copy: 'Requirement-to-case generation, failure triage, flaky detection and duplicate analysis. Local engine works offline, no paid API needed.' },
  { icon: Layers, title: 'Automation studio', copy: 'Chain suites, conditions, retries, delays and approval gates. Schedule runs with a low-resource concurrency cap.' },
  { icon: ShieldCheck, title: 'Security by default', copy: 'RBAC, CSRF tokens, scrypt hashing, rate limits, audit trails, URL allowlists and a sandboxed unit runner.' },
  { icon: BarChart3, title: 'Explainable quality', copy: 'Release readiness with published weights, coverage by test type, defect pressure, flaky trends and exportable reports.' },
  { icon: Bot, title: 'Agent workforce', copy: 'Nine specialised agents with scoped permissions, hourly limits and human approval before anything is written.' },
];

const PLANS = [
  { name: 'Free', price: '$0', tag: 'Genuinely usable', features: ['2 seats · 2 projects', '200 runs / month', 'Unit, API & accessibility engines', 'Local AI assistant', 'JSON reports'], cta: 'Start free', featured: false },
  { name: 'Pro', price: '$29', tag: 'Most popular', features: ['10 seats · 15 projects', '5,000 runs / month', 'Automation & scheduling', 'Performance & security workspaces', 'HTML / PDF-ready reports', 'Playwright adapter'], cta: 'Choose Pro', featured: true },
  { name: 'Ultimate', price: '$79', tag: 'For QA teams', features: ['50 seats · 100 projects', 'Agent workforce', 'Cross-browser matrix', 'Custom integrations', 'Priority support'], cta: 'Choose Ultimate', featured: false },
  { name: 'Business', price: '$199', tag: 'Organisation', features: ['500 seats · 1,000 projects', 'Organization workspaces', 'SSO architecture', 'Audit export', 'Dedicated onboarding'], cta: 'Talk to us', featured: false },
];

const FAQ = [
  ['Does TESTPILOT AI require a paid AI API?', 'No. The product ships with a deterministic local provider that generates cases, plans and failure analyses offline. Ollama or any OpenAI-compatible endpoint can be enabled optionally.'],
  ['Are test results real?', 'Yes. Every run you trigger executes against the configured target with a real engine. Seeded demo history is labelled as sample data, and unsupported adapters report "skipped" with a reason instead of a fake pass.'],
  ['Can it test production?', 'Only against hosts you explicitly allowlist. Passive security scans and bounded load profiles are non-destructive by design, but you remain responsible for authorisation.'],
  ['Where is my data stored?', 'On your machine in a JSON store at data/testpilot.json, with screenshots under data/evidence. Nothing is sent to a third party unless you configure a cloud AI provider.'],
  ['Can I export results?', 'Yes — JSON and print-ready HTML per report. Use the browser print dialog to produce a PDF.'],
  ['Is there a desktop build?', 'The Tauri configuration and packaging documentation are prepared. Signed Windows, macOS and Linux installers require a local Rust toolchain and are not published yet.'],
];

export default function Site() {
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  return (
    <div className="site">
      <nav className="site-nav">
        <Link to="/site" className="row" style={{ gap: 9 }}>
          <div className="brand-mark">TP</div>
          <b style={{ letterSpacing: '-0.02em' }}>TESTPILOT<span style={{ color: 'var(--accent)' }}> AI</span></b>
        </Link>
        <div className="row" style={{ gap: 18, marginLeft: 12 }}>
          <a href="#features">Features</a>
          <a href="#preview">Preview</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link to="/app/docs">Docs</Link>
        </div>
        <div className="spacer" />
        <Link className="btn btn-sm btn-ghost" to="/login">Sign in</Link>
        <Link className="btn btn-sm btn-primary" to="/app">Open app <ArrowRight size={13} /></Link>
      </nav>

      <header className="site-hero">
        <div>
          <span className="badge badge-info"><Sparkles size={11} /> AI Software Testing & QA Engineer</span>
          <h1 style={{ marginTop: 16 }}>
            Build Better.<br />Test Smarter.<br /><span className="gradient-text">Ship Confidently.</span>
          </h1>
          <p className="muted" style={{ marginTop: 18, fontSize: 15, maxWidth: 520 }}>
            TESTPILOT AI plans, generates, executes and explains your testing — from unit logic to security hardening — with evidence behind every result and human approval on every consequential action.
          </p>
          <div className="site-cta">
            <Link className="btn btn-primary" to="/app"><PlayCircle size={15} /> Launch the workspace</Link>
            <a className="btn" href="#preview">See it in action</a>
          </div>
          <div className="row small faint" style={{ marginTop: 18, gap: 18, flexWrap: 'wrap' }}>
            <span className="row" style={{ gap: 5 }}><Check size={13} style={{ color: 'var(--good)' }} /> No paid API required</span>
            <span className="row" style={{ gap: 5 }}><Check size={13} style={{ color: 'var(--good)' }} /> Runs locally</span>
            <span className="row" style={{ gap: 5 }}><Check size={13} style={{ color: 'var(--good)' }} /> Open source</span>
          </div>
        </div>
        <PreviewFrame name="overview" title="Quality overview" imgFailed={imgFailed} setImgFailed={setImgFailed} tall />
      </header>

      <section className="site-section" style={{ paddingTop: 24 }}>
        <div className="grid grid-4">
          {[['14', 'test types supported'], ['9', 'specialised AI agents'], ['100%', 'local-capable intelligence'], ['0', 'credentials required for basic use']].map(([v, l]) => (
            <div key={l} className="card stat"><div className="stat-value">{v}</div><div className="stat-label">{l}</div></div>
          ))}
        </div>
      </section>

      <section className="site-section" id="features">
        <div style={{ maxWidth: 640, marginBottom: 32 }}>
          <span className="badge">Platform</span>
          <h2 style={{ fontSize: 30, marginTop: 12 }}>Every layer of quality, in one place</h2>
          <p className="muted" style={{ marginTop: 8 }}>Not a mockup dashboard — a working testing platform with bounded, inspectable execution.</p>
        </div>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-pad">
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)', marginBottom: 12 }}><f.icon size={18} /></div>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>{f.title}</h3>
              <p className="small muted">{f.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" id="preview">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="badge">Product tour</span>
            <h2 style={{ fontSize: 30, marginTop: 12 }}>The actual workspace</h2>
            <p className="muted" style={{ marginTop: 6 }}>Screenshots captured from the running application.</p>
          </div>
          <Link className="btn" to="/app">Open live app <ArrowRight size={13} /></Link>
        </div>
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <PreviewFrame name="overview" title="Quality overview" imgFailed={imgFailed} setImgFailed={setImgFailed} />
          <PreviewFrame name="runs" title="Execution center" imgFailed={imgFailed} setImgFailed={setImgFailed} />
        </div>
        <div className="grid grid-3">
          <PreviewFrame name="assistant" title="AI assistant" imgFailed={imgFailed} setImgFailed={setImgFailed} />
          <PreviewFrame name="reports" title="Reports & analytics" imgFailed={imgFailed} setImgFailed={setImgFailed} />
          <PreviewFrame name="security" title="Security workspace" imgFailed={imgFailed} setImgFailed={setImgFailed} />
        </div>
      </section>

      <section className="site-section">
        <div className="grid grid-3">
          {[
            { n: '01', t: 'Connect a project', d: 'Point TESTPILOT at a repository and an allowlisted environment URL.', icon: Github },
            { n: '02', t: 'Generate & run', d: 'Draft cases from requirements, approve them, then execute real engines with live evidence.', icon: Zap },
            { n: '03', t: 'Decide with evidence', d: 'Read the explainable readiness score, triage failures and export the release report.', icon: BarChart3 },
          ].map((s) => (
            <div key={s.n} className="card card-pad">
              <div className="row"><span className="mono faint">{s.n}</span><div className="spacer" /><s.icon size={16} className="faint" /></div>
              <h3 style={{ margin: '10px 0 6px', fontSize: 15 }}>{s.t}</h3>
              <p className="small muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" id="pricing">
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <span className="badge">Pricing</span>
          <h2 style={{ fontSize: 30, marginTop: 12 }}>Start free. Scale when you need to.</h2>
          <p className="muted" style={{ marginTop: 8 }}>Plan changes are simulated in this build — no payment is taken.</p>
        </div>
        <div className="price-grid">
          {PLANS.map((p) => (
            <div key={p.name} className={`price ${p.featured ? 'featured' : ''}`}>
              <div className="row"><b style={{ fontSize: 15 }}>{p.name}</b>{p.featured && <span className="badge badge-info" style={{ marginLeft: 'auto' }}>{p.tag}</span>}</div>
              <div className="price-amount">{p.price}<span>/month</span></div>
              <ul className="feature-list">
                {p.features.map((f) => <li key={f}><Check size={13} style={{ color: 'var(--good)', flexShrink: 0, marginTop: 2 }} /> {f}</li>)}
              </ul>
              <Link className={`btn ${p.featured ? 'btn-primary' : ''}`} style={{ marginTop: 'auto' }} to="/login?mode=signup">{p.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" id="faq">
        <div className="split" style={{ alignItems: 'start' }}>
          <div>
            <span className="badge">FAQ</span>
            <h2 style={{ fontSize: 30, marginTop: 12 }}>Straight answers</h2>
            <p className="muted" style={{ marginTop: 8 }}>Honesty is a feature. If something is not bundled, the product says so.</p>
            <div className="stack" style={{ marginTop: 20, gap: 10 }}>
              <Link className="btn btn-sm" to="/app/docs"><Terminal size={13} /> Read the documentation</Link>
              <a className="btn btn-sm" href="https://github.com/mali123456-del/TESTPILOT-AI" target="_blank" rel="noreferrer"><Github size={13} /> View the repository</a>
            </div>
          </div>
          <div>
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <p className="small muted" style={{ marginTop: 8 }}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section" id="download">
        <div className="card card-pad" style={{ padding: 32 }}>
          <div className="split" style={{ alignItems: 'center' }}>
            <div>
              <span className="badge badge-warn">Release status</span>
              <h2 style={{ fontSize: 26, marginTop: 12 }}>Run it today — installers are next</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                The web application is fully runnable now. Tauri packaging is configured for Windows, macOS and Linux, but signed installers are not published yet. Build them locally with the documented commands.
              </p>
              <div className="row" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
                <span className="badge"><Monitor size={11} /> Windows · Tauri config</span>
                <span className="badge"><Chrome size={11} /> macOS · Tauri config</span>
                <span className="badge"><Globe2 size={11} /> Linux · Tauri config</span>
              </div>
            </div>
            <div className="stack" style={{ gap: 10, minWidth: 240 }}>
              <Link className="btn btn-primary" to="/app"><PlayCircle size={14} /> Open web app</Link>
              <a className="btn" href="https://github.com/mali123456-del/TESTPILOT-AI" target="_blank" rel="noreferrer"><Github size={14} /> Source & releases</a>
              <Link className="btn" to="/app/docs">Build & packaging guide</Link>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '36px 6vw', color: 'var(--muted)', fontSize: 12.5 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 20, maxWidth: 1240, margin: '0 auto' }}>
          <div>
            <div className="row" style={{ gap: 8 }}><div className="brand-mark" style={{ width: 28, height: 28, fontSize: 12 }}>TP</div><b>TESTPILOT AI</b></div>
            <div className="faint" style={{ marginTop: 8 }}>Build Better. Test Smarter. Ship Confidently.</div>
          </div>
          <div className="spacer" />
          <div className="stack" style={{ gap: 6 }}>
            <b style={{ color: 'var(--text)' }}>Product</b>
            <a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#preview">Preview</a>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <b style={{ color: 'var(--text)' }}>Resources</b>
            <Link to="/app/docs">Documentation</Link>
            <a href="https://github.com/mali123456-del/TESTPILOT-AI" target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://github.com/mali123456-del/TESTPILOT-AI/issues" target="_blank" rel="noreferrer">Support & contact</a>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <b style={{ color: 'var(--text)' }}>Trust</b>
            <span className="row" style={{ gap: 5 }}><Lock size={11} /> Local-first storage</span>
            <span className="row" style={{ gap: 5 }}><ShieldCheck size={11} /> Audit logging</span>
          </div>
        </div>
        <div className="faint" style={{ maxWidth: 1240, margin: '24px auto 0', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          © {new Date().getFullYear()} TESTPILOT AI. Independent product. Test only systems you are authorised to test.
        </div>
      </footer>
    </div>
  );
}

function PreviewFrame({ name, title, imgFailed, setImgFailed, tall }: { name: string; title: string; imgFailed: Record<string, boolean>; setImgFailed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; tall?: boolean }) {
  return (
    <div className="screenshot-frame">
      <div className="screenshot-bar"><span /><span /><span /><span style={{ marginLeft: 'auto', width: 'auto', height: 'auto', background: 'none', fontSize: 10.5, color: 'var(--faint)' }}>{title}</span></div>
      {!imgFailed[name] ? (
        <img
          src={`/screenshots/${name}.png`}
          alt={`TESTPILOT AI ${title} screenshot`}
          style={{ width: '100%', display: 'block' }}
          onError={() => setImgFailed((prev) => ({ ...prev, [name]: true }))}
        />
      ) : (
        <div className="mock-ui" style={tall ? { minHeight: 300 } : undefined}>
          <div className="mock-hero" />
          <div className="mock-row"><div className="mock-card" /><div className="mock-card" /><div className="mock-card" /></div>
          <div className="mock-chart" />
          <div className="mock-row"><div className="mock-card" /><div className="mock-card" /><div className="mock-card" /></div>
          <div className="faint" style={{ fontSize: 10.5, textAlign: 'center' }}>Live UI preview — open the app to explore</div>
        </div>
      )}
    </div>
  );
}
