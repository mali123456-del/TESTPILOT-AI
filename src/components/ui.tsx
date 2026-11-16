import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { X, AlertTriangle, Bug, CheckCircle2, FlaskConical, Layers, ListChecks, PlayCircle, ShieldCheck, Sparkles, Timer, TrendingUp, Workflow, Zap } from 'lucide-react';
import type { Toast } from '../lib/hooks';

const ICONS: Record<string, React.ComponentType<any>> = {
  alert: AlertTriangle, bug: Bug, check: CheckCircle2, flask: FlaskConical, layers: Layers,
  list: ListChecks, play: PlayCircle, shield: ShieldCheck, sparkles: Sparkles, timer: Timer,
  trend: TrendingUp, workflow: Workflow, zap: Zap,
};

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="toolbar">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={`card ${className}`} style={style}>{children}</section>;
}

export function CardHead({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <div className="card-title">{title}</div>
        {desc && <div className="card-desc">{desc}</div>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, delta, tone, statIcon, statGlow, statIconColor }: { label: string; value: ReactNode; delta?: ReactNode; tone?: 'good' | 'bad' | 'warn'; statIcon?: string; statGlow?: string; statIconColor?: string }) {
  const Icon = statIcon ? ICONS[statIcon] : undefined;
  const valueColor = statIconColor ?? (tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : undefined);
  return (
    <div className="card stat-card" style={statGlow ? ({ '--glow': statGlow } as React.CSSProperties) : undefined}>
      <div className="stat-top">
        {Icon ? (
          <div className="stat-icon" style={statIconColor ? { color: statIconColor } : undefined}>
            <Icon size={18} strokeWidth={2} />
          </div>
        ) : null}
        {delta && <span className="stat-change">{delta}</span>}
      </div>
      <div className="stat-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const STATUS_MAP: Record<string, string> = {
  passed: 'badge-good',
  ok: 'badge-good',
  healthy: 'badge-good',
  completed: 'badge-good',
  resolved: 'badge-good',
  approved: 'badge-good',
  active: 'badge-good',
  configured: 'badge-good',
  available: 'badge-info',
  running: 'badge-info',
  queued: 'badge-info',
  in_progress: 'badge-info',
  in_progress_run: 'badge-info',
  failed: 'badge-bad',
  error: 'badge-bad',
  open: 'badge-bad',
  critical: 'badge-bad',
  high: 'badge-warn',
  awaiting_approval: 'badge-warn',
  pending: 'badge-warn',
  medium: 'badge-warn',
  skipped: 'badge',
  'not-run': 'badge',
  draft: 'badge',
  paused: 'badge-warn',
  blocked: 'badge-warn',
  unavailable: 'badge',
  closed: 'badge',
  low: 'badge',
  info: 'badge-info',
  cancelled: 'badge',
};

export function Badge({ children, tone, status }: { children?: ReactNode; tone?: string; status?: string }) {
  const cls = tone ? `badge-${tone}` : STATUS_MAP[status ?? ''] ?? '';
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {children ?? (status ?? '').replace(/[_-]/g, ' ')}
    </span>
  );
}

export function Progress({ value, tone }: { value: number; tone?: 'good' | 'bad' }) {
  return (
    <div className={`progress ${tone ?? (value >= 80 ? 'good' : value < 50 ? 'bad' : '')}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Ring({ value, size = 92, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? 'var(--good)' : value >= 55 ? 'var(--warn)' : 'var(--bad)';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? 'Score'}: ${Math.round(value)} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={7} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>{Math.round(value)}</div>
          <div style={{ fontSize: 9, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label ?? 'score'}</div>
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ data, height = 54, color = 'var(--accent)' }: { data: number[]; height?: number; color?: string }) {
  const gid = useId().replace(/:/g, '');
  if (!data.length) return <div className="faint small">No data yet</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 100},${height - ((v - min) / range) * (height - 6) - 3}`);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} role="img" aria-label="Trend chart">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points.join(' ')} 100,${height}`} fill={`url(#${gid})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Bars({ data, height = 130 }: { data: Array<{ label: string; value: number }>; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, paddingTop: 8 }} role="img" aria-label="Bar chart">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div className="small faint">{d.value}</div>
          <div
            style={{
              width: '100%',
              maxWidth: 34,
              height: `${Math.max((d.value / max) * (height - 34), 2)}px`,
              borderRadius: '5px 5px 2px 2px',
              background: 'linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 45%, transparent))',
            }}
          />
          <div className="small faint truncate" style={{ width: '100%', textAlign: 'center' }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ segments, size = 120 }: { segments: Array<{ label: string; value: number; color: string }>; size?: number }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  let offset = 0;
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={12} />
        {total > 0 &&
          segments.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={`${s.label}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={12}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="stack" style={{ gap: 6 }}>
        {segments.map((s, i) => (
          <div key={`${s.label}-${i}`} className="row small">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            <span className="muted">{s.label}</span>
            <b style={{ marginLeft: 'auto' }}>{s.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {desc && <p className="small">{desc}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Modal({ title, children, onClose, footer, wide }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { width: 'min(900px, 100%)' } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Dialog({
  open, title, onClose, children, footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={active === t} className={`tab ${active === t ? 'active' : ''}`} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: string }) {
  return <div className="skeleton" style={{ height, width }} />;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={i === 0 ? 22 : 14} width={i === 0 ? '40%' : '100%'} />
      ))}
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} onClick={() => onDismiss(t.id)} role="status">
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-sm btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function FormField({
  label, hint, error, required, children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      {label && (
        <label className="label" htmlFor={fieldId}>
          {label}
          {required && <span className="faint" style={{ marginLeft: 4 }}> required</span>}
        </label>
      )}
      <div>{children}</div>
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="badge badge-bad" style={{ fontSize: '10.5px', padding: '2px 6px', display: 'block', marginTop: 4 }}>{error}</span>}
    </div>
  );
}

export function Select({
  label, value, onChange, options, hint, error, required, className = '',
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  const fieldId = useId();
  return (
    <FormField label={label} hint={hint} error={error} required={required}>
      <select
        id={fieldId}
        className={`select ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FormField>
  );
}

export function Checkbox({
  label, checked, onChange, hint, error, required,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
        <input
          id={fieldId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="faint"
          style={{ width: 16, height: 16, marginTop: 2, cursor: 'pointer' }}
        />
        <label htmlFor={fieldId} className="label" style={{ cursor: 'pointer' }}>
          {label}
          {required && <span className="faint" style={{ marginLeft: 4 }}> required</span>}
        </label>
      </div>
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="badge badge-bad" style={{ fontSize: '10.5px', padding: '2px 6px', display: 'block', marginTop: 4 }}>{error}</span>}
    </div>
  );
}

export function ConfirmDialog({
  open, title, description, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  if (!open) return null;
  return (
    <Modal title={title} onClose={onCancel} footer={
      <>
        <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
        <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </>
    }>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row small"><AlertTriangle size={14} style={{ color: 'var(--bad)', marginRight: 6 }} />{description}</div>
      </div>
    </Modal>
  );
}

export function DataTable({
  columns, rows, emptyMessage, rowActions,
}: {
  columns: Array<{ key: string; label: string; sortable?: boolean }>;
  rows: Array<Record<string, unknown>>;
  emptyMessage?: string;
  rowActions?: (row: Record<string, unknown>) => ReactNode;
}) {
  if (!rows.length) {
    return <Card><EmptyState title="No items" desc={emptyMessage} /></Card>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="small faint">{c.label}</th>
            ))}
            {rowActions && (
              <th className="small faint" style={{ width: 120 }} />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              {columns.map((c) => (
                <td key={c.key} className="small">{String(row[c.key])}</td>
              ))}
              {rowActions && (
                <td key="actions" className="nowrap">{rowActions(row)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card card-pad">
      <div className="stack" style={{ gap: 12 }}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} height={i === 0 ? 20 : 14} width={i === 0 ? '35%' : '70%'} />
        ))}
      </div>
    </div>
  );
}
