import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/hooks';
import { Field } from '../components/ui';

export default function ChangePassword() {
  const { changePassword, auth } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const mustChange = auth?.mustChangePassword === true;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      setSuccess(true);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      // Small delay so the success toast is visible before navigating
      setTimeout(() => navigate(mustChange ? '/app' : '/app/team', { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password');
    } finally {
      setBusy(false);
    }
  };

  if (success) {
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
            Password changed
          </h1>
          <p className="muted" style={{ maxWidth: 440 }}>
            Your password has been updated successfully. You will be redirected shortly.
          </p>
        </aside>
        <section className="auth-form">
          <div className="auth-card">
            <div className="card card-pad" style={{ textAlign: 'center' }}>
              <CheckCircle2 size={48} style={{ color: 'var(--good)', marginBottom: 16 }} />
              <h2>Password updated</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                Sign in with your new password next time.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

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
          {mustChange ? 'Set a new password' : 'Change password'}
        </h1>
        <p className="muted" style={{ maxWidth: 440 }}>
          {mustChange
            ? 'Your demo account is using a default password. Please choose a new, strong password before continuing.'
            : 'Update your account password. Your new password must be at least 8 characters.'}
        </p>
        <div className="card card-pad small" style={{ marginTop: 16, maxWidth: 440 }}>
          <AlertTriangle size={14} style={{ color: 'var(--warn)', marginRight: 6 }} />
          <strong style={{ color: 'var(--warn)' }}>Security notice:</strong>
          <span>Default demo credentials must be rotated before any production use.</span>
        </div>
      </aside>
      <section className="auth-form">
        <div className="auth-card">
          <div>
            <h1>{mustChange ? 'Set a new password' : 'Change password'}</h1>
            <p className="page-sub">{mustChange ? 'Choose a strong password for your demo workspace.' : 'Enter your current password and a new one.'}</p>
          </div>
          <Field label="Current password" hint="Your existing password.">
            <input
              className="input"
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input
              className="input"
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Confirm new password" hint="Type the new password again.">
            <input
              className="input"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>
          {error && (
            <div className="badge badge-bad" role="alert" style={{ whiteSpace: 'normal', padding: 8 }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ width: '100%', padding: 10 }}>
            {busy ? 'Please wait…' : 'Update password'} <ArrowRight size={15} />
          </button>
          <Link to={mustChange ? '/app' : '/app/team'} className="small muted" style={{ marginTop: 10, display: 'inline-block' }}>
            {mustChange ? 'Continue to dashboard' : 'Back to team & settings'}
          </Link>
        </div>
      </section>
    </div>
  );
}
