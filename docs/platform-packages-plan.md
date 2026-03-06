# Plan: Platform-Specific Binary Packages

## Problem

The current `@datadog/serverless-compat` package bundles all platform binaries
(`linux-amd64`, `linux-arm64`, `windows-amd64`) into a single npm package. Users
installing on any given platform receive binaries for all platforms, making the
package unnecessarily large.

## Goal

Users should receive only the binary matching their platform and architecture when
installing `@datadog/serverless-compat`. The install command, public API, and all
existing behavior must remain unchanged.

## Solution: Optional Platform-Specific Packages

This is the same pattern used by `esbuild`, `@swc/core`, `@rollup/rollup-*`, and
others. Each platform gets its own npm package containing only its binary. These
packages are listed as `optionalDependencies` in the main package. npm, yarn, and
pnpm skip installing optional dependencies whose `os`/`cpu` fields don't match the
current system — no scripts needed, no registry downloads of non-matching binaries.

## User-Facing Impact

None. The following remain completely unchanged:

| Thing | Status |
|-------|--------|
| `npm install @datadog/serverless-compat` | Unchanged |
| `start()` API | Unchanged |
| `node --require @datadog/serverless-compat/init` preload | Unchanged |
| `DD_SERVERLESS_COMPAT_PATH` env var override | Unchanged |
| Error behavior when binary is missing | Unchanged |
| macOS dev machines (no binary, graceful skip) | Unchanged |

Users who explicitly pass `--no-optional` / `--ignore-optional` to their package
manager will not receive the platform binary. This is an explicit opt-out and
follows the same behavior as other tools using this pattern.

## New Packages

Three new packages, each containing only the binary for that platform:

| Package name | `os` | `cpu` | Binary |
|---|---|---|---|
| `@datadog/serverless-compat-linux-x64` | `linux` | `x64` | `bin/datadog-serverless-compat` |
| `@datadog/serverless-compat-linux-arm64` | `linux` | `arm64` | `bin/datadog-serverless-compat` |
| `@datadog/serverless-compat-win32-x64` | `win32` | `x64` | `bin/datadog-serverless-compat.exe` |

Each lives under `packages/{name}/` in this repository and has its own `package.json`
with `os`, `cpu`, `files`, and `publishConfig` fields. No code — only a binary and
a `package.json`.

Package versions always match the main package version (1:1).

## Changes

### 1. New files

```
packages/
  linux-x64/
    package.json
  linux-arm64/
    package.json
  win32-x64/
    package.json
```

Each `package.json` follows this structure:

```json
{
  "name": "@datadog/serverless-compat-linux-x64",
  "version": "0.0.0",
  "description": "Linux x64 binary for @datadog/serverless-compat",
  "os": ["linux"],
  "cpu": ["x64"],
  "files": ["bin/**/*"],
  "publishConfig": {
    "access": "public",
    "executableFiles": ["./bin/datadog-serverless-compat"]
  },
  "license": "Apache-2.0"
}
```

The `version` field is a placeholder. CI replaces it with the real version before
publishing.

### 2. `package.json` (main)

- Remove `bin/**/*` from `files` — binaries no longer ship in the main package
- Add `optionalDependencies` pointing to all three platform packages:

```json
"optionalDependencies": {
  "@datadog/serverless-compat-linux-x64": "0.0.0",
  "@datadog/serverless-compat-linux-arm64": "0.0.0",
  "@datadog/serverless-compat-win32-x64": "0.0.0"
}
```

Versions are `0.0.0` placeholders updated by CI at publish time.

### 3. `src/index.ts` — `getBinaryPath()` only

Binary resolution order (invisible to users):

1. `DD_SERVERLESS_COMPAT_PATH` env var — unchanged, checked first
2. **Primary (new)**: resolve the binary from the installed optional platform package
   using `require.resolve('@datadog/serverless-compat-{os}-{arch}/package.json')`,
   then navigate to `bin/` inside that directory
3. **Fallback**: existing `bin/{os}-{arch}/` path inside the main package — supports
   local development via `yarn pack-local` and `download_binaries.sh`

Arch naming: the platform package names use npm/Node.js conventions (`x64`, `arm64`)
while the fallback continues to use the existing binary directory names (`amd64`,
`arm64`) that `download_binaries.sh` produces.

### 4. `.github/workflows/publish.yml`

Both the `build` and `publish` jobs receive a new step after downloading the `bin`
artifact that copies binaries into the platform package directories:

```
bin/linux-amd64/datadog-serverless-compat   -> packages/linux-x64/bin/
bin/linux-arm64/datadog-serverless-compat   -> packages/linux-arm64/bin/
bin/windows-amd64/datadog-serverless-compat.exe -> packages/win32-x64/bin/
```

The `publish` job additionally:

1. Sets each platform package's `version` to `$PACKAGE_VERSION`
2. Updates the `optionalDependencies` versions in the main `package.json` to
   `$PACKAGE_VERSION`
3. Publishes platform packages **first** — ensures they exist on the registry
   before any user can install the main package that references them
4. Publishes the main package as before (`yarn npm publish`)

Platform packages are published using `yarn npm publish` from within each package
directory. Yarn Berry's `.yarnrc.yml` at the repo root is picked up from
subdirectories, so auth and registry config are inherited.

## Local Development

`download_binaries.sh` is unchanged. Binaries continue to be downloaded to
`bin/{os}-{arch}/`. The fallback path in `getBinaryPath()` finds them there for
local testing.

`yarn pack-local` produces a main package tgz without binaries. To test end-to-end
locally, either:
- Set `DD_SERVERLESS_COMPAT_PATH` to the binary path directly, or
- Install the platform package tarballs manually alongside the main package

## Publish Order (Critical)

Platform packages **must** be published before the main package on every release.
If the main package is published first, users who install immediately will see
optional dependency resolution failures until the platform packages appear on the
registry.

CI enforces this order: platform publish steps run sequentially before
`yarn npm publish` for the main package.
