import crypto from 'node:crypto';

const KEY_LEN = 64;

/** IPv4 private / reserved ranges that must not be reachable via server-side fetch.
 * Covers RFC 1918 (10/8, 172.16/12, 192.168/16), loopback (127/8, ::1),
 * link-local (169.254/16), and documentation/example ranges.
 * Localhost (127.0.0.1 / ::1 / localhost) is deliberately allowed for local QA
 * because test targets may run on the same host. Other private addresses are
 * blocked to mitigate SSRF. */
const PRIVATE_IPV4_PREFIXES = [
  '0.',       // 0/8 - this network
  '10.',      // 10/8 - private
  '127.',     // 127/8 - loopback (localhost allowed below)
  '169.254.', // 169.254/16 - link-local
  '172.16.',  // 172.16/12 - private
  '172.17.',  // 172.16/12 - private
  '172.18.',  // 172.16/12 - private
  '172.19.',  // 172.16/12 - private
  '172.20.',  // 172.16/12 - private
  '172.21.',  // 172.16/12 - private
  '172.22.',  // 172.16/12 - private
  '172.23.',  // 172.16/12 - private
  '172.24.',  // 172.16/12 - private
  '172.25.',  // 172.16/12 - private
  '172.26.',  // 172.16/12 - private
  '172.27.',  // 172.16/12 - private
  '172.28.',  // 172.16/12 - private
  '172.29.',  // 172.16/12 - private
  '172.30.',  // 172.16/12 - private
  '172.31.',  // 172.16/12 - private
  '192.168.', // 192.168/16 - private
  '224.',     // 224/4 - multicast
  '240.',     // 240/4 - reserved
];
const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function isPrivateIpv4(host: string): boolean {
  // Only treat as an IP literal if it's all digits and dots.
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return PRIVATE_IPV4_PREFIXES.some((p) => host.startsWith(p));
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  try {
    const candidate = crypto.scryptSync(password, salt, KEY_LEN);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function token(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Fixed-window in-memory rate limiter. Adequate for a single-node deployment. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  consume(key: string): { ok: boolean; remaining: number; retryAfter: number } {
    const at = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= at) {
      this.hits.set(key, { count: 1, resetAt: at + this.windowMs });
      this.prune(at);
      return { ok: true, remaining: this.limit - 1, retryAfter: 0 };
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      return { ok: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - at) / 1000) };
    }
    return { ok: true, remaining: this.limit - entry.count, retryAfter: 0 };
  }

  private prune(at: number): void {
    if (this.hits.size < 2000) return;
    for (const [k, v] of this.hits) if (v.resetAt <= at) this.hits.delete(k);
  }
}

/** Progressive login lockout: tracks consecutive failures per identifier.
 * After MAX_FAILURES consecutive failures, the identifier is locked for LOCKOUT_MS.
 * A successful login clears the failure count. */
export class LoginLockout {
  private hits = new Map<string, { failures: number; lockedUntil: number }>();
  private static readonly MAX_FAILURES = 5;
  private static readonly LOCKOUT_MS = 15 * 60_000; // 15 minutes

  consume(key: string): { ok: boolean; remaining: number; retryAfter: number; locked: boolean } {
    const at = Date.now();
    const entry = this.hits.get(key);
    if (entry && entry.lockedUntil > at) {
      return { ok: false, remaining: 0, retryAfter: Math.ceil((entry.lockedUntil - at) / 1000), locked: true };
    }
    if (entry && entry.failures >= LoginLockout.MAX_FAILURES) {
      entry.lockedUntil = at + LoginLockout.LOCKOUT_MS;
      return { ok: false, remaining: 0, retryAfter: Math.ceil(LoginLockout.LOCKOUT_MS / 1000), locked: true };
    }
    return { ok: true, remaining: LoginLockout.MAX_FAILURES - (entry?.failures ?? 0), retryAfter: 0, locked: false };
  }

  recordFailure(key: string): void {
    const at = Date.now();
    const entry = this.hits.get(key);
    if (!entry) {
      this.hits.set(key, { failures: 1, lockedUntil: 0 });
      return;
    }
    entry.failures += 1;
    if (entry.failures >= LoginLockout.MAX_FAILURES) {
      entry.lockedUntil = at + LoginLockout.LOCKOUT_MS;
    }
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function sanitizeText(value: unknown, max = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max).trim();
}

const BLOCKED_HOSTS = ['169.254.169.254', 'metadata.google.internal', 'metadata.azure.internal'];

/** Reject non-HTTP and cloud-metadata targets. Localhost stays allowed for local QA.
 * Private / reserved IPv4 addresses (except localhost) are blocked to mitigate SSRF.
 */
export function assertSafeUrl(raw: string, allowlist: string[] = []): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https targets are permitted');
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(host)) throw new Error('Target host is blocked');
  if (!LOCALHOST_NAMES.has(host) && isPrivateIpv4(host)) {
    throw new Error(`Host ${host} is a private/reserved address and is not permitted`);
  }
  if (allowlist.length > 0 && !allowlist.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new Error(`Host ${host} is not in this project's allowed hosts`);
  }
  return url;
}
