#!/usr/bin/env node
'use strict';

// Integration test: verifies platform binary package resolution and crash-free startup.
// Runs natively on the target OS — no Docker required.

const { existsSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ── 1. Determine expected package name from current platform ─────────────────
const osName = process.platform; // 'linux', 'darwin', 'win32'
const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64';
const pkgName = `@datadog/serverless-compat-${osName}-${arch}`;
const binaryFilename = process.platform === 'win32'
  ? 'datadog-serverless-compat.exe'
  : 'datadog-serverless-compat';

console.log(`\n=== Test: package resolution (${pkgName}) ===`);

// ── 2. Verify require.resolve finds the platform package ────────────────────
let pkgJsonPath;
try {
  pkgJsonPath = require.resolve(`${pkgName}/package.json`);
} catch (e) {
  console.error(`FAIL: ${pkgName} not resolvable — is it installed? ${e.message}`);
  process.exit(1);
}

const pkgDir = path.dirname(pkgJsonPath);
const binaryPath = path.join(pkgDir, 'bin', binaryFilename);

console.log(`Platform pkg dir : ${pkgDir}`);
console.log(`Binary path      : ${binaryPath}`);

if (!existsSync(binaryPath)) {
  console.error(`FAIL: binary not found at ${binaryPath}`);
  process.exit(1);
}
console.log(`PASS: binary exists at ${binaryPath}`);

// ── 3. Spawn the binary directly — check it does not crash ──────────────────
console.log('\n=== Test: binary crash-free startup ===');

// spawnSync with a short timeout: the binary is a long-running daemon so it won't
// exit on its own. We give it 2s and then the timeout kills it.
// Success = killed by timeout (ETIMEDOUT) or SIGTERM.
// Failure = POSIX crash signal OR Windows structured-exception exit code (0xC0000xxx).
const result = spawnSync(binaryPath, [], {
  timeout: 2000,
  stdio: 'pipe',
  env: { ...process.env, DD_LOG_LEVEL: 'debug' },
});

// POSIX crash signals
const CRASH_SIGNALS = new Set(['SIGSEGV', 'SIGABRT', 'SIGILL', 'SIGBUS']);

// Windows structured-exception codes: 0xC0000000–0xCFFFFFFF are fatal crashes
// e.g. 0xC0000005 = access violation, 0xC000001D = illegal instruction.
// On Windows, result.signal is null for crashes; check status instead.
const isWindowsCrashCode = (status) => {
  if (process.platform !== 'win32' || typeof status !== 'number') return false;
  const unsigned = status >>> 0; // convert signed int32 to unsigned uint32
  return unsigned >= 0xC0000000 && unsigned <= 0xCFFFFFFF;
};

if (CRASH_SIGNALS.has(result.signal)) {
  console.error(`FAIL: binary crashed with signal ${result.signal}`);
  if (result.stderr) console.error(result.stderr.toString());
  process.exit(1);
}

if (isWindowsCrashCode(result.status)) {
  console.error(`FAIL: binary crashed with Windows exit code 0x${result.status.toString(16).toUpperCase()}`);
  if (result.stderr) console.error(result.stderr.toString());
  process.exit(1);
}

if (result.error && result.error.code !== 'ETIMEDOUT') {
  console.error(`FAIL: unexpected spawn error: ${result.error}`);
  process.exit(1);
}

// Catch early exits: if the binary exited before the timeout with a non-zero
// status, it failed to start (e.g. missing config, bad binary). This catches
// failures that produce no crash signal and no spawn error.
if (!result.error && result.status !== null && result.status !== 0) {
  console.error(`FAIL: binary exited early with status ${result.status}`);
  if (result.stderr) console.error(result.stderr.toString());
  process.exit(1);
}

console.log(`PASS: binary ran without crash (signal=${result.signal ?? 'none'}, status=${result.status ?? 'n/a'})`);

// ── 4. Verify start() resolves and spawns the binary via @datadog/serverless-compat ──
console.log('\n=== Test: start() integration ===');

process.env.FUNCTIONS_EXTENSION_VERSION = '~4';
process.env.FUNCTIONS_WORKER_RUNTIME = 'node';
delete process.env.WEBSITE_SKU;
process.env.DD_LOG_LEVEL = 'debug';

const cp = require('child_process');
const origSpawn = cp.spawn;
let spawnOccurred = false;

cp.spawn = function(cmd, ...args) {
  console.log(`SPAWN intercepted: ${cmd}`);
  spawnOccurred = true;
  if (!cmd.includes('datadog-serverless-compat')) {
    console.error(`FAIL: unexpected binary spawned: ${cmd}`);
    process.exit(1);
  }
  if (!existsSync(cmd)) {
    console.error(`FAIL: spawned path does not exist: ${cmd}`);
    process.exit(1);
  }
  console.log('PASS: correct binary path spawned');
  return origSpawn.call(this, cmd, ...args);
};

const { start } = require('@datadog/serverless-compat');
start();

setTimeout(() => {
  if (!spawnOccurred) {
    console.error('FAIL: start() did not call spawn()');
    process.exit(1);
  }
  console.log('\n=== All tests passed ===');
  process.exit(0);
}, 1500);
