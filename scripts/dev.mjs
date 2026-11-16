#!/usr/bin/env node
/**
 * Starts the API and the Vite dev server without extra dependencies.
 * The web client proxies /api to the API port, so both must run.
 */
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

const children = [];

function run(name, args) {
  const child = spawn(npx, args, { stdio: 'inherit', shell: isWin, env: process.env });
  child.on('exit', (code) => {
    console.log(`[dev] ${name} exited with code ${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

function shutdown(code = 0) {
  for (const c of children) {
    if (!c.killed) c.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('api', ['tsx', 'watch', 'server/index.ts']);
run('web', ['vite']);
console.log('[dev] API → http://127.0.0.1:4318');
console.log('[dev] Web → http://127.0.0.1:4317');
