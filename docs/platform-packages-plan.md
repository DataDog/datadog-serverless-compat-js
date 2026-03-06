# Plan: Platform-Specific Binary Packages via Postinstall

## Table of Contents

- [Problem](#problem)
- [Goal](#goal)
- [Solution: Optional Platform Packages + Postinstall Copy](#solution-optional-platform-packages--postinstall-copy)
- [User-Facing Impact](#user-facing-impact)
  - [Known Limitation](#known-limitation)
- [New Packages](#new-packages)
- [Changes](#changes)
  - [1. New Files](#1-new-files)
  - [2. package.json (main)](#2-packagejson-main)
  - [3. src/index.ts — getBinaryPath()](#3-srcindexts--getbinarypath-simplified)
  - [4. .github/workflows/publish.yml](#4-githubworkflowspublishyml)
- [Runtime Performance](#runtime-performance)
- [Local Development](#local-development)
- [Publish Order (Critical)](#publish-order-critical)
- [Potential Enhancement: --ignore-scripts Support](#potential-enhancement---ignore-scripts-support)
- [Prior Art](#prior-art)

## Problem

The current `@datadog/serverless-compat` package bundles all platform binaries
(`linux-amd64`, `linux-arm64`, `windows-amd64`) into a single npm package. Users
installing on any given platform receive binaries for all platforms, making the
package unnecessarily large.

## Goal

Users should receive only the binary matching their platform and architecture when
installing `@datadog/serverless-compat`. The install command, public API, and all
existing behavior must remain unchanged. Runtime performance of `start()` must not
be impacted.

## Solution: Optional Platform Packages + Postinstall Copy

This approach combines two techniques:

1. **Optional platform packages** — each platform gets its own npm package
   containing only its binary, listed as an `optionalDependency`. npm/yarn/pnpm
   skip installing optional dependencies whose `os`/`cpu` fields don't match the
   current system.

2. **Postinstall script** — after installation, a `postinstall` script copies the
   binary from the installed optional platform package into the main package's `bin/`
   directory. At runtime, `getBinaryPath()` is pure string construction with zero I/O.

npm installs all dependencies before running lifecycle scripts, so the optional
platform package is guaranteed to be on disk when `postinstall` runs.

## User-Facing Impact

None. The following remain completely unchanged:

| Thing | Status |
|-------|--------|
| `npm install @datadog/serverless-compat` | Unchanged |
| `start()` API | Unchanged |
| `node --require @datadog/serverless-compat/init` preload | Unchanged |
| `DD_SERVERLESS_COMPAT_PATH` env var override | Unchanged |
| Error behavior when binary is missing | Unchanged |
| Local development via `download_binaries.sh` | Unchanged (fallback path) |

### Known limitation

Users who pass `--ignore-scripts` to their package manager will skip postinstall.
The binary will not be copied, and `start()` will log a clear error and no-op —
the same behavior as `--no-optional` users. This is an explicit opt-out by the user.

See [Potential Enhancement: `--ignore-scripts` support](#potential-enhancement---ignore-scripts-support)
for a planned follow-up that handles this case without sacrificing runtime performance.

## New Packages

Three new packages, each containing only the binary for that platform:

| Package name | `os` | `cpu` | Binary |
|---|---|---|---|
| `@datadog/serverless-compat-linux-x64` | `linux` | `x64` | `bin/datadog-serverless-compat` |
| `@datadog/serverless-compat-linux-arm64` | `linux` | `arm64` | `bin/datadog-serverless-compat` |
| `@datadog/serverless-compat-win32-x64` | `win32` | `x64` | `bin/datadog-serverless-compat.exe` |

Each lives under `packages/{name}/` in this repository. No code — only a binary
and a `package.json`. Package versions always match the main package version (1:1).

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
scripts/
  postinstall.js
```

**Platform package `package.json` structure:**

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

**`scripts/postinstall.js`:**

Runs at install time. Resolves the matching optional platform package, copies its
binary into `bin/` inside the main package directory. Exits silently and
non-fatally if the optional package is not installed (`--no-optional`).

```
node_modules/@datadog/serverless-compat-linux-x64/bin/datadog-serverless-compat
  → node_modules/@datadog/serverless-compat/bin/datadog-serverless-compat
```

### 2. `package.json` (main)

- Add `"postinstall": "node scripts/postinstall.js"` to `scripts`
- Add `"scripts/postinstall.js"` to `files` (must ship in the published tarball)
- Add `optionalDependencies` for the three platform packages:
  ```json
  "@datadog/serverless-compat-linux-x64": "0.0.0",
  "@datadog/serverless-compat-linux-arm64": "0.0.0",
  "@datadog/serverless-compat-win32-x64": "0.0.0"
  ```
- `bin/**/*` stays out of `files` — the binary is not shipped in the tarball,
  it is created at install time by postinstall
- Versions are `0.0.0` placeholders updated by CI at publish time

### 3. `src/index.ts` — `getBinaryPath()` simplified

Remove `require.resolve()`, `dirname`, and memoization entirely. Revert to pure
string construction — zero I/O, zero overhead:

```
Resolution order:
1. DD_SERVERLESS_COMPAT_PATH env var           (unchanged, checked first)
2. bin/datadog-serverless-compat[.exe]          (flat — populated by postinstall)
3. bin/{os}-{arch}/datadog-serverless-compat   (fallback for local dev via download_binaries.sh)
```

Step 2 and 3 are free string construction. The existing `existsSync` check in
`start()` handles a missing binary — no new I/O in `getBinaryPath()` itself.

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
2. Updates `optionalDependencies` versions in main `package.json` to `$PACKAGE_VERSION`
3. Publishes platform packages **first** — ensures they exist on the registry
   before postinstall runs on any user's machine
4. Publishes the main package as before (`yarn npm publish`)

Platform packages are published using `yarn npm publish` from within each package
directory. Yarn Berry's `.yarnrc.yml` at the repo root is picked up from
subdirectories, so auth and registry config are inherited.

## Runtime Performance

| | Before (all binaries bundled) | Previous approach (require.resolve) | This approach (postinstall) |
|---|---|---|---|
| `getBinaryPath()` cost | Pure string ops (~0) | `require.resolve` ~0.5–2ms first call, then ~0 (memoized) | Pure string ops (~0) |
| Binary download per install | All platforms | Matching platform only | Matching platform only |

Postinstall restores the original runtime performance of `getBinaryPath()` —
pure string construction, no filesystem calls, no module resolution.

## Local Development

`download_binaries.sh` is unchanged. Binaries continue to be downloaded to
`bin/{os}-{arch}/`. The fallback path in `getBinaryPath()` (step 3 above) finds
them there for local testing without needing `DD_SERVERLESS_COMPAT_PATH`.

## Publish Order (Critical)

Platform packages **must** be published before the main package on every release.
If the main package is published first, users who install immediately will have
postinstall try to copy from platform packages that don't yet exist on the registry,
silently resulting in no binary.

CI enforces this order: platform publish steps run sequentially before
`yarn npm publish` for the main package.

## Potential Enhancement: `--ignore-scripts` Support

Users who run `npm install --ignore-scripts` skip the postinstall script entirely.
This is common in security-conscious CI environments and enterprise setups.

### Approach: Combine postinstall + runtime fallback

Add `require.resolve()` as a secondary fallback in `getBinaryPath()`, used only
when the postinstall flat binary is absent. With memoization, the fallback executes
at most once per process lifetime.

**Updated resolution order in `getBinaryPath()`:**

```
1. DD_SERVERLESS_COMPAT_PATH env var       (free — env lookup)
2. bin/datadog-serverless-compat[.exe]     (existsSync ~0.1ms — postinstall path)
3. require.resolve() from optional pkg     (--ignore-scripts fallback, ~0.5–2ms first call only)
4. bin/{os}-{arch}/                        (free string op — local dev fallback)
```

All results after step 1 are memoized, so subsequent `start()` calls cost nothing
regardless of which path was taken.

**Performance characteristics:**

| Scenario | First call cost | Subsequent calls |
|---|---|---|
| Postinstall ran (common) | `existsSync` ~0.1ms | ~0 (memoized) |
| `--ignore-scripts` used | `existsSync` + `require.resolve()` ~0.6–2ms | ~0 (memoized) |
| Local dev | `existsSync` x2 + string op ~0.2ms | ~0 (memoized) |

**Required changes:**

- `src/index.ts`: add `require.resolve()` between steps 2 and 4, add memoization
- No changes to postinstall, platform packages, CI, or `package.json`

This enhancement is backward compatible and purely additive — the postinstall fast
path is preserved for all users who do not pass `--ignore-scripts`.

## Prior Art

The optional platform packages pattern is the industry standard for distributing
platform-specific binaries via npm. The following widely-used tools use the same
approach:

### esbuild

The canonical reference. The main `esbuild` package declares every platform package
as an `optionalDependency`. npm skips installing packages whose `os`/`cpu` fields
don't match the current system.

- Main package with `optionalDependencies`: [npm/esbuild/package.json](https://github.com/evanw/esbuild/blob/main/npm/esbuild/package.json)
- Platform packages: `@esbuild/linux-x64`, `@esbuild/darwin-arm64`, `@esbuild/win32-x64`, etc.
- Design rationale: [issue #789 — Different strategy for installing platform-specific binaries](https://github.com/evanw/esbuild/issues/789)
- Architecture overview: [Platform-Specific Binaries — esbuild DeepWiki](https://deepwiki.com/evanw/esbuild/6.2-platform-specific-binaries)

Key difference from our approach: esbuild resolves the binary at runtime via
`require.resolve()` rather than using a postinstall copy. We use postinstall so
`getBinaryPath()` remains zero-overhead pure string construction.

### @swc/core

Same pattern: `@swc/core-linux-x64-gnu`, `@swc/core-darwin-arm64`, etc. listed as
`optionalDependencies` in the main `@swc/core` package.

- [npm page](https://www.npmjs.com/package/@swc/core)

### Comparison with our implementation

| | esbuild | @swc/core | ours |
|---|---|---|---|
| Sub-package naming | `@esbuild/linux-x64` | `@swc/core-linux-x64-gnu` | `@datadog/serverless-compat-linux-x64` |
| `os`/`cpu` fields | On each sub-package | On each sub-package | On each sub-package |
| Main package | `optionalDependencies` | `optionalDependencies` | `optionalDependencies` |
| Binary resolution | `require.resolve()` at runtime | `require.resolve()` at runtime | `postinstall` copy + string path |
