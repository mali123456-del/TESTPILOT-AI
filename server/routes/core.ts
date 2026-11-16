import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { Entitlements, Plan, ResultStatus, Role, TestCase, User } from '../../shared/types.js';
import { getDb, id, now, saveDb, audit, pruneSessions } from '../store.js';
import { EMAIL_RE, RateLimiter, hashPassword, LoginLockout, sanitizeText, token, verifyPassword } from '../security.js';
import { seedDemo } from '../seed.js';

export interface AuthedRequest extends Request {
  user?: User;
  session?: { id: string; csrf: string; workspaceId: string };
}

const COOKIE = 'tp_session';
const SESSION_DAYS = 7;

export const PLAN_ENTITLEMENTS: Record<Plan, Entitlements> = {
  free: {
    plan: 'free',
    seats: 2,
    projects: 2,
    runsPerMonth: 200,
    aiAssistsPerDay: 25,
    features: ['Projects & suites', 'Unit / API / accessibility engines', 'Local AI assistant', 'JSON reports'],
  },
  pro: {
    plan: 'pro',
    seats: 10,
    projects: 15,
    runsPerMonth: 5000,
    aiAssistsPerDay: 500,
    features: ['Everything in Free', 'Scheduling & automation studio', 'Performance & security workspaces', 'HTML/PDF-ready reports', 'Playwright adapter'],
  },
  ultimate: {
    plan: 'ultimate',
    seats: 50,
    projects: 100,
    runsPerMonth: 50000,
    aiAssistsPerDay: 5000,
    features: ['Everything in Pro', 'AI agent workforce', 'Cross-browser matrix', 'Priority support', 'Custom integrations'],
  },
  business: {
    plan: 'business',
    seats: 500,
    projects: 1000,
    runsPerMonth: 250000,
    aiAssistsPerDay: 20000,
    features: ['Everything in Ultimate', 'Organization workspaces', 'SSO architecture', 'Audit export', 'Dedicated onboarding'],
  },
};

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function setSessionCookie(res: Response, sessionId: string): void {
  const secure = process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1';
  res.setHeader(
    'set-cookie',
    `${COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (!sid) return next();
  const db = getDb();
  const session = db.sessions.find((s) => s.id === sid);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    if (session) {
      db.sessions = db.sessions.filter((s) => s.id !== sid);
      saveDb();
    }
    return next();
  }
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return next();
  req.user = user;
  req.session = { id: session.id, csrf: session.csrf, workspaceId: session.workspaceId };
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/** CSRF double-submit protection for every state-changing API call. */
export function requireCsrf(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.headers['x-csrf-token'] !== req.session.csrf) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  next();
}

const ROLES: Record<Role, number> = { viewer: 1, tester: 2, qa_lead: 3, admin: 4, owner: 5 };
export function requireRole(role: Role) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || ROLES[req.user.role] < ROLES[role]) {
      res.status(403).json({ error: `Requires ${role} privileges` });
      return;
    }
    next();
  };
}

export function entitlementsFor(plan: Plan): Entitlements {
  return PLAN_ENTITLEMENTS[plan] ?? PLAN_ENTITLEMENTS.free;
}

export function createSession(userId: string, workspaceId: string): string {
  const db = getDb();
  pruneSessions();
  const sid = token(24);
  db.sessions.push({
    id: sid,
    userId,
    workspaceId,
    csrf: token(24),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString(),
    createdAt: now(),
  });
  saveDb();
  return sid;
}

export function publicUser(u: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _ignored, ...rest } = u;
  return rest;
}

export const loginLimiter = new RateLimiter(12, 15 * 60_000);
export const registerLimiter = new RateLimiter(6, 15 * 60_000);
export const loginLockout = new LoginLockout();
export const apiLimiter = new RateLimiter(900, 60_000);
export const aiLimiter = new RateLimiter(40, 60_000);

const credentials = z.object({
  email: z.string().regex(EMAIL_RE, 'Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const coreRouter = Router();

coreRouter.post('/auth/register', (req: AuthedRequest, res) => {
  const regLimit = registerLimiter.consume(req.ip ?? 'unknown');
  if (!regLimit.ok) return res.status(429).json({ error: `Too many registration attempts. Retry in ${regLimit.retryAfter}s.` });
  const parsed = credentials
    .extend({ name: z.string().min(2).max(80), workspaceName: z.string().min(2).max(80).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' });
  const db = getDb();
  const email = parsed.data.email.toLowerCase();
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists' });
  const workspaceId = id('ws');
  const userId = id('usr');
  const name = sanitizeText(parsed.data.name, 80);
  db.workspaces.push({
    id: workspaceId,
    name: sanitizeText(parsed.data.workspaceName ?? `${name}'s workspace`, 80),
    slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${workspaceId.slice(-4)}`,
    plan: 'free',
    ownerId: userId,
    aiApprovalsRequired: true,
    allowedHosts: [],
    createdAt: now(),
  });
  db.users.push({ id: userId, workspaceId, email, name, role: 'owner', passwordHash: hashPassword(parsed.data.password), createdAt: now() });
  saveDb();
  const sid = createSession(userId, workspaceId);
  setSessionCookie(res, sid);
  const session = db.sessions.find((s) => s.id === sid)!;
  audit(workspaceId, name, 'auth.register', email, undefined, req.ip);
  return res.status(201).json({
    user: publicUser(db.users.find((u) => u.id === userId)!),
    workspace: db.workspaces.find((w) => w.id === workspaceId),
    csrfToken: session.csrf,
    entitlements: entitlementsFor('free'),
  });
});

coreRouter.post('/auth/login', (req: AuthedRequest, res) => {
  const ip = req.ip ?? 'unknown';
  const emailKey = `login:${String(req.body?.email ?? '').toLowerCase()}`;
  const lock = loginLockout.consume(emailKey);
  if (lock.locked) {
    audit('unknown', String(req.body?.email ?? ''), 'auth.login_locked', undefined, undefined, req.ip);
    return res.status(423).json({ error: `Account locked. Retry in ${lock.retryAfter}s.` });
  }
  const limit = loginLimiter.consume(ip);
  if (!limit.ok) return res.status(429).json({ error: `Too many attempts. Retry in ${limit.retryAfter}s.` });
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' });
  const db = getDb();
  const user = db.users.find((u) => u.email === parsed.data.email.toLowerCase());
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    loginLockout.recordFailure(emailKey);
    audit(user?.workspaceId ?? 'unknown', parsed.data.email, 'auth.login_failed', undefined, undefined, req.ip);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  loginLockout.clear(emailKey);
  user.lastSeenAt = now();
  // Session fixation protection: rotate session by removing any existing sessions
  // for this user before issuing a new one.
  db.sessions = db.sessions.filter((s) => s.userId !== user.id);
  const sid = createSession(user.id, user.workspaceId);
  setSessionCookie(res, sid);
  const session = db.sessions.find((s) => s.id === sid)!;
  const workspace = db.workspaces.find((w) => w.id === user.workspaceId)!;
  audit(user.workspaceId, user.name, 'auth.login', user.email, undefined, req.ip);
  saveDb();
  return res.json({
    user: publicUser(user),
    workspace,
    csrfToken: session.csrf,
    entitlements: entitlementsFor(workspace.plan),
    mustChangePassword: user.mustChangePassword === true,
  });
});

coreRouter.post('/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  db.sessions = db.sessions.filter((s) => s.id !== req.session?.id);
  saveDb();
  clearSessionCookie(res);
  res.json({ ok: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

coreRouter.post('/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' });
  const db = getDb();
  const user = db.users.find((u) => u.id === req.user!.id);
  if (!user || !user.passwordHash || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (verifyPassword(parsed.data.newPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'New password must differ from the current password' });
  }
  user.passwordHash = hashPassword(parsed.data.newPassword);
  user.mustChangePassword = false;
  saveDb();
  audit(user.workspaceId, user.name, 'auth.password_changed', user.email, undefined, req.ip);
  res.json({ ok: true, mustChangePassword: false });
});

coreRouter.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const workspace = db.workspaces.find((w) => w.id === req.user!.workspaceId);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  const user = db.users.find((u) => u.id === req.user!.id);
  res.json({
    user: publicUser(user ?? req.user!),
    workspace,
    csrfToken: req.session!.csrf,
    entitlements: entitlementsFor(workspace.plan),
    mustChangePassword: user?.mustChangePassword === true,
  });
});

coreRouter.get('/workspace', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const workspace = db.workspaces.find((w) => w.id === req.user!.workspaceId)!;
  res.json({
    workspace,
    members: db.users.filter((u) => u.workspaceId === workspace.id).map(publicUser),
    entitlements: entitlementsFor(workspace.plan),
    usage: {
      runsThisMonth: db.runs.filter((r) => r.workspaceId === workspace.id && r.startedAt.slice(0, 7) === now().slice(0, 7)).length,
      projects: db.projects.filter((p) => p.workspaceId === workspace.id).length,
      seats: db.users.filter((u) => u.workspaceId === workspace.id).length,
    },
  });
});

coreRouter.patch('/workspace', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().min(2).max(80).optional(),
    plan: z.enum(['free', 'pro', 'ultimate', 'business']).optional(),
    aiApprovalsRequired: z.boolean().optional(),
    allowedHosts: z.array(z.string().max(200)).max(50).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid workspace payload' });
  const db = getDb();
  const workspace = db.workspaces.find((w) => w.id === req.user!.workspaceId)!;
  if (parsed.data.plan && req.user!.role !== 'owner') return res.status(403).json({ error: 'Only the owner can change the plan' });
  Object.assign(workspace, {
    name: parsed.data.name ? sanitizeText(parsed.data.name, 80) : workspace.name,
    plan: parsed.data.plan ?? workspace.plan,
    aiApprovalsRequired: parsed.data.aiApprovalsRequired ?? workspace.aiApprovalsRequired,
    allowedHosts: parsed.data.allowedHosts ?? workspace.allowedHosts,
  });
  saveDb();
  audit(workspace.id, req.user!.name, 'workspace.updated', workspace.name, { fields: Object.keys(parsed.data) }, req.ip);
  res.json({ workspace, entitlements: entitlementsFor(workspace.plan) });
});

coreRouter.post('/workspace/members', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({ name: z.string().min(2).max(80), email: z.string().regex(EMAIL_RE), role: z.enum(['admin', 'qa_lead', 'tester', 'viewer']), password: z.string().min(8).max(200) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid member payload' });
  const db = getDb();
  const workspace = db.workspaces.find((w) => w.id === req.user!.workspaceId)!;
  if (db.users.filter((u) => u.workspaceId === workspace.id).length >= entitlementsFor(workspace.plan).seats) {
    return res.status(402).json({ error: 'Seat limit reached for this plan' });
  }
  if (db.users.some((u) => u.email === parsed.data.email.toLowerCase())) return res.status(409).json({ error: 'Email already in use' });
  const user: User = {
    id: id('usr'),
    workspaceId: workspace.id,
    email: parsed.data.email.toLowerCase(),
    name: sanitizeText(parsed.data.name, 80),
    role: parsed.data.role,
    passwordHash: hashPassword(parsed.data.password),
    createdAt: now(),
  };
  db.users.push(user);
  saveDb();
  audit(workspace.id, req.user!.name, 'member.invited', user.email, { role: user.role }, req.ip);
  res.status(201).json({ member: publicUser(user) });
});

/* --------------------------------------------------------------- projects */
coreRouter.get('/projects', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const list = db.projects
    .filter((p) => p.workspaceId === req.user!.workspaceId)
    .map((p) => ({
      ...p,
      status: p.status ?? ('active' as const),
      suiteCount: db.suites.filter((s) => s.projectId === p.id).length,
      caseCount: db.cases.filter((c) => c.projectId === p.id).length,
      openBugCount: db.bugs.filter((b) => b.projectId === p.id && (b.status === 'open' || b.status === 'in_progress')).length,
    }));
  res.json(list);
});

coreRouter.post('/projects', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      name: z.string().min(2).max(80),
      key: z.string().min(2).max(8),
      description: z.string().max(500).optional(),
      repoUrl: z.string().url().optional().or(z.literal('')),
      baseUrl: z.string().url().optional().or(z.literal('')),
      environment: z.enum(['development', 'staging', 'production']).optional(),
      allowedHosts: z.array(z.string()).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid project' });
  const db = getDb();
  const workspace = db.workspaces.find((w) => w.id === req.user!.workspaceId)!;
  if (db.projects.filter((p) => p.workspaceId === workspace.id).length >= entitlementsFor(workspace.plan).projects) {
    return res.status(402).json({ error: 'Project limit reached for this plan' });
  }
  const project = {
    id: id('prj'),
    workspaceId: workspace.id,
    name: sanitizeText(parsed.data.name, 80),
    key: sanitizeText(parsed.data.key, 8).toUpperCase(),
    description: sanitizeText(parsed.data.description ?? '', 500),
    repoUrl: parsed.data.repoUrl || undefined,
    baseUrl: parsed.data.baseUrl || undefined,
    environment: parsed.data.environment ?? ('staging' as const),
    allowedHosts: parsed.data.allowedHosts ?? [],
    createdAt: now(),
  };
  db.projects.push(project);
  saveDb();
  audit(workspace.id, req.user!.name, 'project.created', project.name, { projectId: project.id }, req.ip);
  res.status(201).json(project);
});

/** Update editable project fields. Core identity (key) is deliberately immutable so run/defect IDs stay meaningful. */
coreRouter.patch('/projects/:id', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      name: z.string().min(2).max(80).optional(),
      description: z.string().max(500).optional(),
      repoUrl: z.string().url().optional().or(z.literal('')),
      baseUrl: z.string().url().optional().or(z.literal('')),
      environment: z.enum(['development', 'staging', 'production']).optional(),
      allowedHosts: z.array(z.string()).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid project update' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.id && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const changed: string[] = [];
  if (parsed.data.name !== undefined && parsed.data.name !== project.name) {
    project.name = sanitizeText(parsed.data.name, 80);
    changed.push('name');
  }
  if (parsed.data.description !== undefined && parsed.data.description !== project.description) {
    project.description = sanitizeText(parsed.data.description, 500);
    changed.push('description');
  }
  if (parsed.data.repoUrl !== undefined) {
    project.repoUrl = (parsed.data.repoUrl || undefined) as string | undefined;
    changed.push('repoUrl');
  }
  if (parsed.data.baseUrl !== undefined) {
    project.baseUrl = (parsed.data.baseUrl || undefined) as string | undefined;
    changed.push('baseUrl');
  }
  if (parsed.data.environment !== undefined && parsed.data.environment !== project.environment) {
    project.environment = parsed.data.environment;
    changed.push('environment');
  }
  if (parsed.data.allowedHosts !== undefined) {
    project.allowedHosts = parsed.data.allowedHosts;
    changed.push('allowedHosts');
  }
  if (changed.length) {
    saveDb();
    audit(project.workspaceId, req.user!.name, 'project.updated', project.name, { projectId: project.id, fields: changed }, req.ip);
  }
  res.json(project);
});

coreRouter.post('/projects/:id/archive', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.id && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.status === 'archived') return res.status(409).json({ error: 'Project already archived' });
  project.status = 'archived';
  project.archivedAt = now();
  saveDb();
  audit(project.workspaceId, req.user!.name, 'project.archived', project.name, { projectId: project.id }, req.ip);
  res.json(project);
});

coreRouter.post('/projects/:id/restore', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.id && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.status !== 'archived') return res.status(409).json({ error: 'Project is not archived' });
  delete project.status;
  delete project.archivedAt;
  saveDb();
  audit(project.workspaceId, req.user!.name, 'project.restored', project.name, { projectId: project.id }, req.ip);
  res.json(project);
});

/** Activity feed: audit trail entries attributable to this project (meta.projectId plus legacy project.created). */
coreRouter.get('/projects/:id/activity', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.id && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const events = db.audit
    .filter(
      (a) =>
        a.workspaceId === project.workspaceId &&
        (a.meta?.projectId === project.id || (a.action === 'project.created' && a.target === project.name)),
    )
    .slice(0, 80);
  res.json(events);
});

coreRouter.delete('/projects/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.id && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  db.projects = db.projects.filter((p) => p.id !== project.id);
  db.suites = db.suites.filter((s) => s.projectId !== project.id);
  db.cases = db.cases.filter((c) => c.projectId !== project.id);
  db.runs = db.runs.filter((r) => r.projectId !== project.id);
  db.bugs = db.bugs.filter((b) => b.projectId !== project.id);
  saveDb();
  audit(project.workspaceId, req.user!.name, 'project.deleted', project.name, { projectId: project.id }, req.ip);
  res.json({ ok: true });
});

/* ----------------------------------------------------------------- suites */
coreRouter.get('/suites', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  res.json(
    db.suites.filter((s) => s.workspaceId === req.user!.workspaceId && (projectId ? s.projectId === projectId : true)).map((s) => ({
      ...s,
      caseCount: db.cases.filter((c) => c.suiteId === s.id).length,
      lastRun: db.runs.find((r) => r.suiteId === s.id),
    })),
  );
});

coreRouter.post('/suites', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      projectId: z.string(),
      name: z.string().min(2).max(100),
      type: z.enum(['unit', 'integration', 'e2e', 'regression', 'smoke', 'acceptance', 'api', 'ui', 'database', 'accessibility', 'visual', 'performance', 'security', 'cross-browser']),
      description: z.string().max(500).optional(),
      tags: z.array(z.string().max(30)).max(10).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid suite payload' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const suite = {
    id: id('ste'),
    workspaceId: req.user!.workspaceId,
    projectId: project.id,
    name: sanitizeText(parsed.data.name, 100),
    type: parsed.data.type,
    description: sanitizeText(parsed.data.description ?? '', 500),
    tags: parsed.data.tags ?? [parsed.data.type],
    createdAt: now(),
  };
  db.suites.push(suite);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'suite.created', suite.name, undefined, req.ip);
  res.status(201).json(suite);
});

/* ------------------------------------------------------------------ cases */
const caseSchema = z.object({
  suiteId: z.string(),
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(['unit', 'integration', 'e2e', 'regression', 'smoke', 'acceptance', 'api', 'ui', 'database', 'accessibility', 'visual', 'performance', 'security', 'cross-browser']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  automation: z.enum(['automated', 'manual']).optional(),
  code: z.string().max(20000).optional(),
  request: z.any().optional(),
  targetUrl: z.string().max(2000).optional(),
  fixture: z.any().optional(),
  steps: z.array(z.string().max(500)).max(50).optional(),
  expected: z.string().max(1000).optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
  timeoutMs: z.number().int().min(500).max(120000).optional(),
  enabled: z.boolean().optional(),
  aiGenerated: z.boolean().optional(),
});

coreRouter.get('/cases', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const q = String(req.query.q ?? '').toLowerCase();
  const suiteId = typeof req.query.suiteId === 'string' ? req.query.suiteId : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  let cases = db.cases.filter((c) => c.workspaceId === req.user!.workspaceId);
  if (suiteId) cases = cases.filter((c) => c.suiteId === suiteId);
  if (projectId) cases = cases.filter((c) => c.projectId === projectId);
  if (type) cases = cases.filter((c) => c.type === type);
  if (q) cases = cases.filter((c) => `${c.title} ${c.tags.join(' ')} ${c.description ?? ''}`.toLowerCase().includes(q));
  res.json(cases);
});

coreRouter.post('/cases', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = caseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid case' });
  const db = getDb();
  const suite = db.suites.find((s) => s.id === parsed.data.suiteId && s.workspaceId === req.user!.workspaceId);
  if (!suite) return res.status(404).json({ error: 'Suite not found' });
  const testCase: TestCase = {
    id: id('case'),
    workspaceId: req.user!.workspaceId,
    projectId: suite.projectId,
    suiteId: suite.id,
    title: sanitizeText(parsed.data.title, 200),
    description: parsed.data.description ? sanitizeText(parsed.data.description, 1000) : undefined,
    type: parsed.data.type ?? suite.type,
    priority: parsed.data.priority ?? 'medium',
    automation: parsed.data.automation ?? 'automated',
    code: parsed.data.code,
    request: parsed.data.request,
    targetUrl: parsed.data.targetUrl,
    fixture: parsed.data.fixture,
    steps: parsed.data.steps,
    expected: parsed.data.expected,
    tags: parsed.data.tags ?? [suite.type],
    timeoutMs: parsed.data.timeoutMs ?? 15000,
    enabled: parsed.data.enabled ?? true,
    aiGenerated: parsed.data.aiGenerated,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  };
  db.cases.push(testCase);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'case.created', testCase.title, { caseId: testCase.id }, req.ip);
  res.status(201).json(testCase);
});

coreRouter.post('/cases/bulk', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z.object({ ids: z.array(z.string()), action: z.enum(['delete', 'enable', 'disable', 'duplicate']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid bulk payload' });
  const db = getDb();
  const cases = db.cases.filter((c) => parsed.data.ids.includes(c.id) && c.workspaceId === req.user!.workspaceId);
  if (!cases.length) return res.status(404).json({ error: 'No matching cases' });
  if (parsed.data.action === 'delete') {
    db.cases = db.cases.filter((c) => !cases.some((x) => x.id === c.id));
    saveDb();
    audit(req.user!.workspaceId, req.user!.name, 'cases.bulk_delete', `${cases.length} cases`, undefined, req.ip);
    return res.json({ ok: true, count: cases.length });
  }
  if (parsed.data.action === 'enable' || parsed.data.action === 'disable') {
    cases.forEach((c) => { c.enabled = parsed.data.action === 'enable'; c.version = (c.version || 1) + 1; c.updatedAt = now(); });
    saveDb();
    audit(req.user!.workspaceId, req.user!.name, `cases.bulk_${parsed.data.action}`, `${cases.length} cases`, undefined, req.ip);
    return res.json({ ok: true, count: cases.length });
  }
  if (parsed.data.action === 'duplicate') {
    const dups = cases.map(c => ({ ...c, id: id('case'), title: `${c.title} (Copy)`, version: 1, createdAt: now(), updatedAt: now() }));
    db.cases.push(...dups);
    saveDb();
    audit(req.user!.workspaceId, req.user!.name, 'cases.bulk_duplicate', `${cases.length} cases`, undefined, req.ip);
    return res.json({ ok: true, count: dups.length });
  }
  res.status(400).json({ error: 'Unsupported action' });
});

coreRouter.patch('/cases/:id', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const db = getDb();
  const testCase = db.cases.find((c) => c.id === req.params.id && c.workspaceId === req.user!.workspaceId);
  if (!testCase) return res.status(404).json({ error: 'Case not found' });
  const parsed = caseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid case patch' });
  Object.assign(testCase, parsed.data);
  testCase.version = (testCase.version || 1) + 1;
  testCase.updatedAt = now();
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'case.updated', testCase.title, { fields: Object.keys(parsed.data) }, req.ip);
  res.json(testCase);
});

coreRouter.get('/cases/:id/history', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const runs = db.runs
    .filter((r) => r.workspaceId === req.user!.workspaceId)
    .map((r) => {
      const result = r.results.find((x) => x.caseId === req.params.id);
      if (!result) return null;
      return {
        runId: r.id,
        projectId: r.projectId,
        suiteId: r.suiteId,
        mode: r.mode ?? 'automated',
        runStatus: r.status,
        status: result.status,
        durationMs: result.durationMs,
        message: result.message,
        actualResult: result.actualResult,
        notes: result.notes,
        executedBy: result.executedBy ?? r.triggeredBy,
        executedAt: result.executedAt ?? r.finishedAt ?? r.startedAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b!.executedAt) - Date.parse(a!.executedAt))
    .slice(0, 50);
  res.json({ caseId: req.params.id, runs });
});

coreRouter.delete('/cases/:id', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const db = getDb();
  const before = db.cases.length;
  db.cases = db.cases.filter((c) => !(c.id === req.params.id && c.workspaceId === req.user!.workspaceId));
  if (db.cases.length === before) return res.status(404).json({ error: 'Case not found' });
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'case.deleted', req.params.id, undefined, req.ip);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- bugs */
coreRouter.get('/bugs', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  res.json(db.bugs.filter((b) => b.workspaceId === req.user!.workspaceId && (projectId ? b.projectId === projectId : true)));
});

coreRouter.post('/bugs', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      projectId: z.string(),
      title: z.string().min(3).max(200),
      description: z.string().max(3000),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      reproduction: z.string().max(3000).optional(),
      linkedRunId: z.string().optional(),
      linkedCaseId: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid bug payload' });
  const db = getDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId && p.workspaceId === req.user!.workspaceId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const bug = {
    id: id('bug'),
    workspaceId: req.user!.workspaceId,
    projectId: project.id,
    title: sanitizeText(parsed.data.title, 200),
    description: sanitizeText(parsed.data.description, 3000),
    severity: parsed.data.severity ?? 'medium',
    status: 'open' as const,
    reproduction: parsed.data.reproduction ? sanitizeText(parsed.data.reproduction, 3000) : undefined,
    linkedRunId: parsed.data.linkedRunId,
    linkedCaseId: parsed.data.linkedCaseId,
    assignee: req.user!.name,
    createdAt: now(),
    updatedAt: now(),
  };
  db.bugs.unshift(bug);
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'bug.created', bug.title, undefined, req.ip);
  res.status(201).json(bug);
});

coreRouter.patch('/bugs/:id', requireAuth, requireRole('tester'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(), severity: z.enum(['low', 'medium', 'high', 'critical']).optional(), assignee: z.string().max(80).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid bug patch' });
  const db = getDb();
  const bug = db.bugs.find((b) => b.id === req.params.id && b.workspaceId === req.user!.workspaceId);
  if (!bug) return res.status(404).json({ error: 'Bug not found' });
  Object.assign(bug, parsed.data, { updatedAt: now() });
  saveDb();
  audit(req.user!.workspaceId, req.user!.name, 'bug.updated', bug.title, parsed.data, req.ip);
  res.json(bug);
});

/* --------------------------------------------------------------- dashboard */
export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  projectId?: string;
}

export function computeMetrics(workspaceId: string, opts: DashboardFilters = {}) {
  const db = getDb();
  const projects = db.projects.filter((p) => p.workspaceId === workspaceId);
  const projectIds = new Set(
    projects
      .filter((p) => !opts.projectId || p.id === opts.projectId)
      .map((p) => p.id),
  );
  const runs = db.runs.filter((r) => {
    if (!projectIds.has(r.projectId)) return false;
    if (opts.startDate && r.finishedAt && r.finishedAt < opts.startDate) return false;
    if (opts.endDate && r.finishedAt && r.finishedAt > opts.endDate) return false;
    return true;
  });
  const finished = runs.filter((r) => r.finishedAt);
  const executed = finished.flatMap((r) => r.results.filter((x) => x.status !== 'skipped' && x.status !== 'not-run'));
  const passed = executed.filter((r) => r.status === 'passed').length;
  const failed = executed.filter((r) => r.status === 'failed' || r.status === 'error').length;
  const passRate = executed.length ? Math.round((passed / executed.length) * 1000) / 10 : 0;
  const bugs = db.bugs.filter((b) => {
    if (!projectIds.has(b.projectId)) return false;
    if (opts.startDate && b.createdAt < opts.startDate) return false;
    if (opts.endDate && b.createdAt > opts.endDate) return false;
    return true;
  });
  const openBugs = bugs.filter((b) => b.status === 'open' || b.status === 'in_progress');

  const caseRuns = new Map<string, ResultStatus[]>();
  for (const run of finished.slice(0, 25)) {
    for (const res of run.results) {
      if (!projectIds.has(run.projectId)) continue;
      caseRuns.set(res.caseId, [...(caseRuns.get(res.caseId) ?? []), res.status]);
    }
  }
  const flaky: Array<{ caseId: string; title: string; passes: number; failures: number; rate: number }> = [];
  for (const [caseId, statuses] of caseRuns) {
    const p = statuses.filter((s) => s === 'passed').length;
    const f = statuses.filter((s) => s === 'failed' || s === 'error').length;
    if (p > 0 && f > 0) {
      const testCase = db.cases.find((c) => c.id === caseId);
      flaky.push({ caseId, title: testCase?.title ?? caseId, passes: p, failures: f, rate: Math.round((f / (p + f)) * 100) });
    }
  }
  flaky.sort((a, b) => b.rate - a.rate);

  const coverageByType = new Map<string, { total: number; automated: number; executed: number }>();
  for (const c of db.cases.filter((x) => projectIds.has(x.projectId))) {
    const entry = coverageByType.get(c.type) ?? { total: 0, automated: 0, executed: 0 };
    entry.total += 1;
    if (c.automation === 'automated') entry.automated += 1;
    if (caseRuns.has(c.id)) entry.executed += 1;
    coverageByType.set(c.type, entry);
  }
  const casesTotal = [...coverageByType.values()].reduce((n, v) => n + v.total, 0);
  const casesExecuted = [...coverageByType.values()].reduce((n, v) => n + v.executed, 0);
  const coverage = casesTotal ? Math.round((casesExecuted / casesTotal) * 100) : 0;

  const criticalFailures = finished.reduce(
    (n, r) =>
      n +
      r.results.filter((res) => (res.status === 'failed' || res.status === 'error') && db.cases.find((c) => c.id === res.caseId)?.priority === 'critical')
        .length,
    0,
  );
  const flakyRate = executed.length ? Math.round((flaky.reduce((n, f) => n + f.failures, 0) / executed.length) * 1000) / 10 : 0;
  // Explainable release readiness: 45% pass rate, 20% coverage, 20% defect pressure, 15% stability.
  const defectPenalty = Math.min(openBugs.length * 3, 30);
  const readiness = Math.max(
    0,
    Math.min(
      100,
      Math.round(passRate * 0.45 + coverage * 0.2 + Math.max(0, 100 - defectPenalty) * 0.2 + Math.max(0, 100 - flakyRate * 4) * 0.15),
    ),
  );

  const trend = finished
    .slice(0, 14)
    .reverse()
    .map((r) => {
      const total = r.summary.passed + r.summary.failed + r.summary.error;
      return {
        id: r.id,
        date: r.finishedAt!.slice(0, 10),
        passRate: total ? Math.round((r.summary.passed / total) * 100) : 0,
        durationMs: r.durationMs ?? 0,
        total: r.summary.total,
      };
    });

  const durationTrend = finished.slice(0, 10).reverse().map((r) => ({ date: r.finishedAt!.slice(0, 10), durationMs: r.durationMs ?? 0 }));

  return {
    projects: projects.length,
    suites: db.suites.filter((s) => projectIds.has(s.projectId)).length,
    cases: casesTotal,
    runs: runs.length,
    passRate,
    executed: executed.length,
    failed,
    openBugs: openBugs.length,
    criticalBugs: openBugs.filter((b) => b.severity === 'critical').length,
    coverage,
    flaky,
    flakyRate,
    criticalFailures,
    readiness,
    readinessBreakdown: [
      { label: 'Pass rate', weight: 45, value: passRate },
      { label: 'Case coverage', weight: 20, value: coverage },
      { label: 'Defect pressure', weight: 20, value: Math.max(0, 100 - defectPenalty) },
      { label: 'Stability', weight: 15, value: Math.max(0, 100 - flakyRate * 4) },
    ],
    trend,
    durationTrend,
    coverageByType: [...coverageByType.entries()].map(([type, v]) => ({ type, ...v })),
    defects: {
      bySeverity: ['critical', 'high', 'medium', 'low'].map((severity) => ({ severity, count: bugs.filter((b) => b.severity === severity).length })),
      byStatus: ['open', 'in_progress', 'resolved', 'closed'].map((status) => ({ status, count: bugs.filter((b) => b.status === status).length })),
    },
    recentRuns: runs.slice(0, 8),
    teamRuns: [...new Set(runs.map((r) => r.triggeredBy))].map((actor) => ({ actor, runs: runs.filter((r) => r.triggeredBy === actor).length })),
    aiProvider: { name: process.env.AI_PROVIDER ?? 'local' },
    demoData: true,
  };
}

coreRouter.get('/dashboard', requireAuth, (req: AuthedRequest, res) => {
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  res.json(computeMetrics(req.user!.workspaceId, { startDate, endDate, projectId }));
});

coreRouter.get('/analytics', requireAuth, (req: AuthedRequest, res) => {
  res.json(computeMetrics(req.user!.workspaceId));
});

coreRouter.post('/demo/seed', requireAuth, requireRole('owner'), (_req: AuthedRequest, res) => {
  if (getDb().users.length > 1) return res.status(409).json({ error: 'Seed only available on an empty instance' });
  seedDemo();
  res.json({ ok: true });
});

coreRouter.get('/audit', requireAuth, requireRole('qa_lead'), (req: AuthedRequest, res) => {
  const db = getDb();
  res.json(db.audit.filter((a) => a.workspaceId === req.user!.workspaceId).slice(0, 300));
});

coreRouter.get('/public/score', (_req, res) => {
  const db = getDb();
  const projects = db.projects;
  const runs = db.runs.filter((r) => r.finishedAt);
  const pass = runs.flatMap((r) => r.results).filter((r) => r.status === 'passed').length;
  const total = runs.flatMap((r) => r.results).filter((r) => r.status !== 'skipped' && r.status !== 'not-run').length;
  res.json({ product: 'TESTPILOT AI', status: 'ok', projects: projects.length, executed: total, passRate: total ? Math.round((pass / total) * 100) : null });
});

coreRouter.get('/entitlements', requireAuth, (req: AuthedRequest, res) => {
  const workspace = getDb().workspaces.find((w) => w.id === req.user!.workspaceId)!;
  res.json(entitlementsFor(workspace.plan));
});
