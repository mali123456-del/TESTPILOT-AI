import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isPrivateIpv4, LoginLockout, RateLimiter, hashPassword, verifyPassword } from '../server/security.js';

describe('URL safety (SSRF protection)', () => {
  it('allows localhost for local QA', () => {
    expect(assertSafeUrl('http://localhost:4318/api/health').hostname).toBe('localhost');
    expect(assertSafeUrl('http://127.0.0.1:4318/api/health').hostname).toBe('127.0.0.1');
  });

  it('rejects private IPv4 addresses', () => {
    expect(() => assertSafeUrl('http://10.0.0.1/api')).toThrow('private/reserved');
    expect(() => assertSafeUrl('http://172.16.0.1/api')).toThrow('private/reserved');
    expect(() => assertSafeUrl('http://192.168.1.1/api')).toThrow('private/reserved');
  });

  it('rejects cloud metadata endpoints', () => {
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow();
  });

  it('rejects non-http schemes', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow();
    expect(() => assertSafeUrl('javascript:alert(1)')).toThrow();
  });

  it('enforces allowlists', () => {
    expect(() => assertSafeUrl('https://evil-example.com', ['example.com'])).toThrow();
    expect(assertSafeUrl('https://api.example.com/x', ['example.com']).hostname).toBe('api.example.com');
  });

  it('detects private IPv4 literals', () => {
    expect(isPrivateIpv4('10.0.0.1')).toBe(true);
    expect(isPrivateIpv4('172.16.0.1')).toBe(true);
    expect(isPrivateIpv4('192.168.1.1')).toBe(true);
    expect(isPrivateIpv4('127.0.0.1')).toBe(true); // loopback is in private list but allowed by caller
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateIpv4('example.com')).toBe(false);
  });
});

describe('Rate limiting', () => {
  it('rejects after limit exceeded', () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.consume('k').ok).toBe(true);
    expect(limiter.consume('k').ok).toBe(true);
    expect(limiter.consume('k').ok).toBe(true);
    expect(limiter.consume('k').ok).toBe(false);
  });

  it('tracks separate keys independently', () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.consume('a').ok).toBe(true);
    expect(limiter.consume('b').ok).toBe(true);
    expect(limiter.consume('a').ok).toBe(false);
  });
});

describe('Login lockout', () => {
  it('locks after max failures', () => {
    const lockout = new LoginLockout();
    const key = 'login:test@example.com';
    for (let i = 0; i < 5; i++) lockout.recordFailure(key);
    expect(lockout.consume(key).locked).toBe(true);
  });

  it('clears on success', () => {
    const lockout = new LoginLockout();
    const key = 'login:test@example.com';
    lockout.recordFailure(key);
    lockout.clear(key);
    expect(lockout.consume(key).locked).toBe(false);
  });
});

describe('Password hashing', () => {
  it('hashes with scrypt and verifies', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('password', 'not-a-hash')).toBe(false);
    expect(verifyPassword('password', undefined)).toBe(false);
  });
});
