'use strict';

// Downloads the platform-specific binary from GitHub Releases and places it
// into this package's bin/ directory so getBinaryPath() can locate it at runtime.
//
// The release artifact naming convention is:
//   datadog-serverless-compat-{linux|windows}-{amd64|arm64}.zip
// Each zip contains a single file: datadog-serverless-compat[.exe]
//
// Runs silently if the platform is not supported (e.g. macOS in local dev).
// Runs silently on network or extraction errors to avoid blocking installs.
//
// DD_SERVERLESS_COMPAT_BINARY_BASE_URL overrides the download base URL.
// Useful for local testing (point at a local HTTP server) or air-gapped envs.
// When set, the platform check is also skipped so macOS can be used for testing.
// Example: DD_SERVERLESS_COMPAT_BINARY_BASE_URL=http://localhost:8080 node scripts/postinstall.js

const { mkdirSync, chmodSync, createWriteStream, unlinkSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');

const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
const osName = process.platform === 'win32' ? 'windows' : 'linux';
const binaryExtension = process.platform === 'win32' ? '.exe' : '';
const binaryFilename = `datadog-serverless-compat${binaryExtension}`;
const zipFilename = `datadog-serverless-compat-${osName}-${arch}.zip`;

const baseUrlOverride = process.env.DD_SERVERLESS_COMPAT_BINARY_BASE_URL;

// Only supported on Linux and Windows; exit silently on macOS in normal installs.
// Skip this check when a base URL override is set (e.g. local testing on macOS).
if (!baseUrlOverride && process.platform !== 'linux' && process.platform !== 'win32') {
  process.exit(0);
}

const { version } = require('../package.json');
const releaseTag = `datadog-serverless-compat/v${version}`;
const defaultBaseUrl = `https://github.com/DataDog/serverless-components/releases/download/${encodeURIComponent(releaseTag)}`;
const downloadUrl = `${baseUrlOverride ?? defaultBaseUrl}/${zipFilename}`;

const destDir = join(__dirname, '..', 'bin');
const destPath = join(destDir, binaryFilename);
const tmpZipPath = join(os.tmpdir(), `dd-serverless-compat-${process.pid}.zip`);

function download(url, dest, redirects) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects'));
      return;
    }
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume(); // drain the response
          resolve(download(res.headers.location, dest, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
          return;
        }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

function extractZip(zipPath, filename, outDir) {
  if (process.platform === 'win32') {
    // PowerShell is available on all modern Windows installations.
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${outDir}" -Force`,
    ]);
  } else {
    // -o: overwrite, -j: junk (strip) paths inside the zip
    execFileSync('unzip', ['-o', '-j', zipPath, filename, '-d', outDir]);
  }
}

async function main() {
  mkdirSync(destDir, { recursive: true });

  await download(downloadUrl, tmpZipPath, 0);

  try {
    extractZip(tmpZipPath, binaryFilename, destDir);
  } finally {
    try {
      unlinkSync(tmpZipPath);
    } catch {
      // best-effort cleanup
    }
  }

  if (process.platform !== 'win32') {
    chmodSync(destPath, 0o755);
  }
}

main().catch(() => {
  // Fail silently — start() will report a missing binary at runtime with a
  // clear error message guiding the user.
  process.exit(0);
});
