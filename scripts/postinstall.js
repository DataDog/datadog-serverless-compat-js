'use strict';

// Copies the platform-specific binary from the installed optional package into
// this package's bin/ directory so getBinaryPath() can use pure string ops at
// runtime with zero I/O overhead.
//
// Runs silently if the optional package is not installed (e.g. --no-optional).
// Runs silently if the platform is not supported (e.g. macOS in local dev).

const { existsSync, mkdirSync, copyFileSync, chmodSync } = require('fs');
const { join, dirname } = require('path');

const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const osName = process.platform === 'win32' ? 'win32' : 'linux';
const binaryExtension = process.platform === 'win32' ? '.exe' : '';
const binaryFilename = `datadog-serverless-compat${binaryExtension}`;
const pkgName = `@datadog/serverless-compat-${osName}-${arch}`;

try {
  const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
  const srcPath = join(dirname(pkgJsonPath), 'bin', binaryFilename);

  if (!existsSync(srcPath)) {
    // Platform package installed but binary missing — nothing to copy.
    process.exit(0);
  }

  const destDir = join(__dirname, '..', 'bin');
  mkdirSync(destDir, { recursive: true });

  const destPath = join(destDir, binaryFilename);
  copyFileSync(srcPath, destPath);

  if (process.platform !== 'win32') {
    chmodSync(destPath, 0o755);
  }
} catch {
  // Optional package not installed (--no-optional or platform mismatch) —
  // nothing to copy. start() will handle the missing binary gracefully.
  process.exit(0);
}
