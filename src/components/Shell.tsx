import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Bug,
  ChevronRight,
  Command,
  Database,
  FolderKanban,
  FlaskConical,
  Gauge,
  KeyRound,
  LayoutDashboard,
  List,
  Menu,
  Moon,
  Bell,
  Plug,
  PlayCircle,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Wand2,
  Workflow,
  X,
  LogOut,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { Toasts } from './ui';
import { api, when } from '../lib/api';
import { useAuth, useTheme, useToasts } from '../lib/hooks';
import type { Approval } from '../../shared/types';

const NAV = [
  {
    group: 'Workspace',
    items: [
      { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/app/projects', label: 'Projects', icon: FolderKanban },
      { to: '/app/runs', label: 'Execution center', icon: PlayCircle },
      { to: '/app/automation', label: 'Automation studio', icon: Workflow },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { to: '/app/assistant', label: 'AI assistant', icon: Sparkles },
      { to: '/app/agents', label: 'Agent workforce', icon: Wand2 },
      { to: '/app/benchmarks', label: 'AI benchmarking', icon: FlaskConical },
    ],
  },
  {
    group: 'Engineering',
    items: [
      { to: '/app/api', label: 'API workspace', icon: Activity },
      { to: '/app/performance', label: 'Performance', icon: Gauge },
      { to: '/app/security', label: 'Security', icon: ShieldCheck },
    ],
  },
  {
    group: 'Quality',
    items: [
      { to: '/app/bugs', label: 'Defects', icon: Bug },
      { to: '/app/reports', label: 'Reports & analytics', icon: BarChart3 },
    ],
  },
  {
    group: 'AI Management',
    items: [
      { to: '/app/ai/providers', label: 'AI Provider Center', icon: Settings },
      { to: '/app/ai/models', label: 'AI Model Registry', icon: Database },
      { to: '/app/ai/playground', label: 'AI Playground', icon: Bot },
      { to: '/app/ai/health', label: 'Provider Health', icon: Activity },
      { to: '/app/ai/routing', label: 'Intelligent Routing', icon: Zap },
      { to: '/app/ai/activity', label: 'Provider Activity', icon: List },
    ],
  },
  {
    group: 'Manage',
    items: [
      { to: '/app/integrations', label: 'Integrations', icon: Plug },
      { to: '/app/team', label: 'Team & settings', icon: Users },
      { to: '/app/docs', label: 'Documentation', icon: BookOpen },
    ],
  },
];

const COMMANDS = [
  ...NAV.flatMap((g) => g.items.map((i) => ({ label: i.label, to: i.to, hint: g.group }))),
  { label: 'Trigger a test run', to: '/app/runs?new=1', hint: 'Action' },
  { label: 'Generate test cases', to: '/app/assistant?generate=1', hint: 'Action' },
  { label: 'Create a defect', to: '/app/bugs?new=1', hint: 'Action' },
  { label: 'Marketing site', to: '/site', hint: 'Product' },
];

export function Shell() {
  const { auth, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { toasts, push, dismiss } = useToasts();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [counts, setCounts] = useState<{ flaky: number; bugs: number }>({ flaky: 0, bugs: 0 });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
      if (menuOpen && e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    api<{ flaky: unknown[]; openBugs: number }>('/dashboard')
      .then((d) => setCounts({ flaky: d.flaky?.length ?? 0, bugs: d.openBugs ?? 0 }))
      .catch(() => undefined);
    api<Approval[]>('/ai/approvals')
      .then((a) => setApprovals(a.filter((x) => x.status === 'pending')))
      .catch(() => undefined);
  }, [location.pathname]);

  const filtered = useMemo(
    () => COMMANDS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())).slice(0, 9),
    [query],
  );

  const runCommand = (to: string) => {
    setPaletteOpen(false);
    setQuery('');
    navigate(to);
  };

  const pending = approvals.length;

  return (
    <div className="app-shell">
      {menuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMenuOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
        />
      )}
      <aside
        className={`sidebar ${menuOpen ? 'open' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 23V9l7 9 7-9v14" />
              <path d="M20 23l7-14v14" />
              <path d="M22 18h4" />
            </svg>
          </div>
          <div>
            <div className="brand-name">TESTPILOT<span style={{ color: '#9485ff' }}>AI</span></div>
            <div className="brand-tag">QUALITY ENGINEERING</div>
          </div>
          <button className="icon-btn mobile-only" style={{ marginLeft: 'auto' }} onClick={() => setMenuOpen(false)} aria-label="Close navigation">
            <X size={15} />
          </button>
        </div>

        {NAV.map((group) => (
          <div key={group.group}>
            <div className="nav-group-label">{group.group}</div>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <item.icon size={15} />
                <span>{item.label}</span>
                {item.label === 'Defects' && counts.bugs > 0 && <span className="count">{counts.bugs}</span>}
                {item.label === 'AI assistant' && pending > 0 && <span className="count">{pending}</span>}
              </NavLink>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <Link to="/site" className="nav-link">
            <KeyRound size={15} />
            <span>Product site</span>
            <ChevronRight size={13} style={{ marginLeft: 'auto' }} />
          </Link>
          <div className="row" style={{ padding: '8px 10px', marginTop: 6 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {auth?.user.name?.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="small truncate" style={{ fontWeight: 600 }}>{auth?.user.name}</div>
              <div className="faint" style={{ fontSize: 10.5, textTransform: 'capitalize' }}>{auth?.user.role.replace('_', ' ')}</div>
            </div>
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 28, height: 28 }} onClick={() => void signOut()} aria-label="Sign out">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
            <Menu size={16} />
          </button>
          <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
            <Search size={14} />
            <span>Search or run a command</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="spacer" />
          <span className="badge badge-info tiny" title="Workspace plan">
            {auth?.workspace.plan.toUpperCase()} · {auth?.workspace.name}
          </span>
          <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setNotifOpen((v) => !v)} aria-label="Notifications" aria-expanded={notifOpen}>
              <Bell size={16} />
              {pending > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--bad)' }} />
              )}
            </button>
            {notifOpen && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 42, width: 320, zIndex: 60, overflow: 'hidden' }}>
                <div className="card-head">
                  <div className="card-title">Notifications</div>
                  <span className="badge badge-warn">{pending} pending</span>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {approvals.length === 0 && <div className="empty small">No pending approvals.</div>}
                  {approvals.map((a) => (
                    <div key={a.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                      <CheckCircle2 size={15} style={{ color: 'var(--warn)', marginTop: 2 }} />
                      <div>
                        <div className="small" style={{ fontWeight: 600 }}>{a.title}</div>
                        <div className="faint" style={{ fontSize: 11 }}>{a.requestedBy} · {when(a.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                  {counts.flaky > 0 && (
                    <div className="list-row">
                      <Activity size={15} style={{ color: 'var(--warn)' }} />
                      <div className="small">{counts.flaky} flaky case(s) need triage</div>
                    </div>
                  )}
                </div>
                <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => navigate('/app/assistant')}>
                    Open approval queue
                  </button>
                </div>
              </div>
            )}
          </div>
          <Link to="/app/runs?new=1" className="btn btn-primary btn-sm">
            <PlayCircle size={14} /> Run tests
          </Link>
        </header>

        <main className="content" id="main">
          <Outlet context={{ push }} />
        </main>
      </div>

      {paletteOpen && (
        <div className="palette" onMouseDown={(e) => e.target === e.currentTarget && setPaletteOpen(false)}>
          <div className="palette-box" role="dialog" aria-modal="true" aria-label="Command palette">
            <input
              className="palette-input"
              autoFocus
              placeholder="Navigate, trigger a run, generate tests…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered[0]) runCommand(filtered[0].to);
                if (e.key === 'Escape') setPaletteOpen(false);
              }}
            />
            <div className="palette-list">
              {filtered.map((c) => (
                <button key={c.to} className="palette-item" onClick={() => runCommand(c.to)}>
                  <Command size={13} />
                  <span>{c.label}</span>
                  <kbd>{c.hint}</kbd>
                </button>
              ))}
              {filtered.length === 0 && <div className="empty small">No matches</div>}
            </div>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
      <span style={{ display: 'none' }}>{counts.bugs}</span>
    </div>
  );
}
