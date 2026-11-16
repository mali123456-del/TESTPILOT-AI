import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Database } from '../server/store.js';
import { JsonStorageAdapter } from '../server/store.js';
import { SqliteStorageAdapter } from '../server/store-sqlite.js';

function seedInitialDb(db: Database): void {
  db.workspaces.push({
    id: 'ws_1',
    name: 'Test Workspace',
    slug: 'test-workspace',
    plan: 'free',
    ownerId: 'usr_1',
    aiApprovalsRequired: true,
    allowedHosts: ['127.0.0.1'],
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  db.users.push({
    id: 'usr_1',
    workspaceId: 'ws_1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'owner',
    passwordHash: 'scrypt$salt$hash',
    createdAt: '2026-01-01T00:00:00.000Z',
    mustChangePassword: true,
  });
}

function addSecondUser(db: Database): void {
  db.users.push({
    id: 'usr_2',
    workspaceId: 'ws_1',
    email: 'second@example.com',
    name: 'Second User',
    role: 'tester',
    passwordHash: 'scrypt$salt$hash2',
    createdAt: '2026-01-02T00:00:00.000Z',
  });
}

describe('Storage adapters', () => {
  describe('JsonStorageAdapter', () => {
    let dir: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testpilot-json-'));
      process.env.TESTPILOT_DATA_DIR = dir;
    });

    afterAll(() => {
      delete process.env.TESTPILOT_DATA_DIR;
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('loads, mutates, persists and reloads', async () => {
      const adapter = new JsonStorageAdapter();
      const db = await adapter.load();
      seedInitialDb(db);
      addSecondUser(db);
      adapter.saveDb();
      adapter.flushDb();

      expect(db.users.length).toBe(2);
      expect(db.users.find((u) => u.email === 'second@example.com')).toBeDefined();

      // Reload from file
      const adapter2 = new JsonStorageAdapter();
      const reloaded = await adapter2.load();
      expect(reloaded.users.length).toBe(2);
      expect(reloaded.users.find((u) => u.email === 'second@example.com')).toBeDefined();

      // File exists on disk
      expect(fs.existsSync(path.join(dir, 'testpilot.json'))).toBe(true);
    });
  });

  describe('SqliteStorageAdapter', () => {
    let dir: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testpilot-sqlite-'));
      process.env.TESTPILOT_DATA_DIR = dir;
    });

    afterAll(() => {
      delete process.env.TESTPILOT_DATA_DIR;
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('loads, mutates, persists and reloads', async () => {
      const adapter = new SqliteStorageAdapter();
      const db = await adapter.load();
      seedInitialDb(db);
      addSecondUser(db);
      adapter.saveDb();
      adapter.flushDb();

      expect(db.users.length).toBe(2);
      expect(db.users.find((u) => u.email === 'second@example.com')).toBeDefined();

      // Reload from file
      const adapter2 = new SqliteStorageAdapter();
      const reloaded = await adapter2.load();
      expect(reloaded.users.length).toBe(2);
      expect(reloaded.users.find((u) => u.email === 'second@example.com')).toBeDefined();

      // SQLite file exists on disk
      expect(fs.existsSync(path.join(dir, 'testpilot.sqlite'))).toBe(true);

      adapter.close();
      adapter2.close();
    });

    it('audit appends and caps at 5000', async () => {
      const adapter = new SqliteStorageAdapter();
      await adapter.load();

      for (let i = 0; i < 5003; i++) {
        adapter.audit('ws_1', 'user', 'test.action', `target-${i}`, { i }, '127.0.0.1');
      }
      adapter.flushDb();

      const db = adapter.db;
      expect(db.audit.length).toBe(5000);
      expect(db.audit[0].action).toBe('test.action');

      adapter.close();
    });

    it('pruneSessions removes expired', async () => {
      const adapter = new SqliteStorageAdapter();
      await adapter.load();

      const db = adapter.db;
      db.sessions.push({
        id: 'sess_old',
        userId: 'usr_1',
        workspaceId: 'ws_1',
        csrf: 'tok',
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        createdAt: new Date(Date.now() - 20000).toISOString(),
      });
      db.sessions.push({
        id: 'sess_new',
        userId: 'usr_1',
        workspaceId: 'ws_1',
        csrf: 'tok2',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      });
      adapter.replaceDatabase(db);
      adapter.saveDb();
      adapter.flushDb();

      adapter.pruneSessions();
      const reloaded = adapter.db;
      expect(reloaded.sessions.length).toBe(1);
      expect(reloaded.sessions[0].id).toBe('sess_new');

      adapter.close();
    });
  });
});
