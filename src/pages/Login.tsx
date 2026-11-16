import { useState } from 'react';
import { Navigate, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles, TestTube2 } from 'lucide-react';
import { useAuth } from '../lib/hooks';
import { Field } from '../components/ui';

export default function Login() {
  const { signIn, signUp, auth } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/app';
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [form, setForm] = useState({ name: '', email: 'demo@testpilot.ai', password: 'Demo1234!', workspaceName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(form.email, form.password);
      else await signUp(form.name, form.email, form.password, form.workspaceName || `${form.name}'s workspace`);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <Link to="/site" className="row" style={{ gap: 10 }}>
          <div className="brand-mark">TP</div>
          <div>
            <div className="brand-name">TESTPILOT AI</div>
            <div className="brand-tag">Build Better. Test Smarter. Ship Confidently.</div>
          </div>
        </Link>
        <h1 style={{ fontSize: 32, lineHeight: 1.15, marginTop: 24, maxWidth: 460 }}>
          Your AI <span className="gradient-text">quality engineer</span> for every release.
        </h1>
        <p className="muted" style={{ maxWidth: 440 }}>
          Plan, generate, execute and analyse tests across unit, API, accessibility, performance and security — with evidence for every result.
        </p>
        <div className="stack" style={{ gap: 12, marginTop: 12, maxWidth: 440 }}>
          <div className="row small"><Sparkles size={15} style={{ color: 'var(--accent)' }} /> Provider-independent AI, offline by default</div>
          <div className="row small"><TestTube2 size={15} style={{ color: 'var(--accent-2)' }} /> Real executors with sandboxed, bounded runs</div>
          <div className="row small"><ShieldCheck size={15} style={{ color: 'var(--good)' }} /> CSRF, RBAC, audit logs and rate limiting</div>
        </div>
      </aside>
      <section className="auth-form">
        <div className="auth-card">
          <div>
            <h1>{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</h1>
            <p className="page-sub">{mode === 'signin' ? 'Sign in to continue testing.' : 'Start free — no payment required.'}</p>
          </div>
          {mode === 'signup' && (
            <>
              <Field label="Your name">
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required />
              </Field>
              <Field label="Workspace name" hint="You can rename this later in Team & settings.">
                <input className="input" value={form.workspaceName} onChange={(e) => setForm({ ...form, workspaceName: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
          </Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
          </Field>
          {error && (
            <div className="badge badge-bad" role="alert" style={{ whiteSpace: 'normal', padding: 8 }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ width: '100%', padding: 10 }}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={15} />
          </button>
          <div className="row small muted" style={{ justifyContent: 'center' }}>
            {mode === 'signin' ? (
              <>New here? <button className="btn btn-ghost btn-sm" onClick={() => setMode('signup')}>Create an account</button></>
            ) : (
              <>Already registered? <button className="btn btn-ghost btn-sm" onClick={() => setMode('signin')}>Sign in</button></>
            )}
          </div>
          {mode === 'signin' && (
            <div className="card card-pad small">
              <b>Demo workspace</b>
              <div className="muted">demo@testpilot.ai · Demo1234!</div>
              <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>Seeded sample history is illustrative; any run you trigger executes for real.</div>
            </div>
          )}
          <Link to="/site" className="small muted">← Back to the product site</Link>
        </div>
      </section>
    </div>
  );
}
