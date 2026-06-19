#!/usr/bin/env node
// ─── LONGLAB CI ORCHESTRATOR ──────────────────────────────────────────────────
// Runs each check in an isolated child with a hard timeout so stale Vitest
// workers/open handles cannot leave the one-command gate hanging indefinitely.

import { spawnSync } from 'child_process';

const DEFAULT_TIMEOUT_MS = 240_000;

const steps = [
  { name: '1. Syntax check', cmd: ['npm', ['run', 'check:all-source-syntax']], timeout: 60_000 },
  { name: '2. Build', cmd: ['npm', ['run', 'build']], timeout: 120_000 },
  { name: '3a. Unit tests (shard 1/2)', cmd: ['npm', ['run', 'test:unit:shard1']] },
  { name: '3b. Unit tests (shard 2/2)', cmd: ['npm', ['run', 'test:unit:shard2']] },
  // The two unit shards partition the entire test set, including every focused
  // research-cockpit test. Do not launch a third Vitest process in this same
  // orchestrator: some CI/container runtimes retain a worker-pool handle after
  // two sequential Vitest children. The dedicated focused scripts remain
  // available for local diagnostics and are independently validated.
  { name: '5. Runtime purity', cmd: ['npm', ['run', 'test:long-purity']], timeout: 60_000 },
  { name: '6. Filter purity', cmd: ['npm', ['run', 'check:long-filter-purity']], timeout: 60_000 },
  { name: '7. Export purity', cmd: ['npm', ['run', 'check:long-export-purity']], timeout: 60_000 },
];

let exitCode = 0;

for (const step of steps) {
  const [command, args] = step.cmd;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Running ${step.name}…`);
  console.log(`  ${command} ${args.join(' ')}`);
  console.log(`${'─'.repeat(60)}`);

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
    timeout: step.timeout ?? DEFAULT_TIMEOUT_MS,
    shell: process.platform === 'win32',
  });

  if (result.error) {
    const timedOut = result.error.code === 'ETIMEDOUT';
    console.error(`✗ ${step.name} ${timedOut ? 'TIMED OUT' : 'FAILED'}: ${result.error.message}`);
    exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    console.error(`✗ ${step.name} FAILED with exit code ${result.status}`);
    exitCode = result.status || 1;
    break;
  }
  console.log(`✓ ${step.name} passed`);
}

console.log(`\n${'═'.repeat(60)}`);
if (exitCode === 0) console.log('✓ ALL CI CHECKS PASSED');
else console.error('✗ CI FAILED — see errors above');
console.log(`${'═'.repeat(60)}\n`);
process.exit(exitCode);
