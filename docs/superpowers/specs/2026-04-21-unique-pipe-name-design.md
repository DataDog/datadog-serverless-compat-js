# Unique Named-Pipe Identifiers for Serverless Compat Binary

**Date:** 2026-04-21
**Status:** Approved design, pending implementation plan
**Repo:** `datadog-serverless-compat-js`

## Problem

When multiple Azure Functions share a namespace, they can collide on the Windows named pipe used to ship telemetry to the Datadog Serverless Compatibility Layer. Without unique pipe names, only one function's telemetry reaches Datadog.

## Goal

Before spawning the compat binary, `start()` assigns a unique pipe name per process so that co-hosted functions cannot collide.

## Non-goals

- Avoiding a fresh pipe per cold start. A random UUID per process is acceptable; deterministic per-function names are out of scope.
- Changes to the compat binary itself. This change is entirely JS-side.
- Cross-language parity with other `datadog-serverless-compat-*` packages.

## Design

### Module boundary

New file: `src/utils/pipe-name.ts`.

Single exported function:

```ts
export function assignUniquePipeNames(logger: Logger): void
```

- Mutates `process.env` in place to set four variables (see below).
- Emits one `logger.warn` per pre-existing user value that is being overridden.
- Returns nothing. The side effect on `process.env` is the contract.

Call site: `src/index.ts` `start()` invokes `assignUniquePipeNames(logger)` after the Azure Flex guard (`src/index.ts:118-123`) and before the binary-resolution block, so the subsequent `env` clone (`src/index.ts:150-153`) picks up the mutations and the child inherits them.

Dependency: Node built-in `crypto.randomUUID()` (Node ≥ 14.17). No new packages.

### Scope

Unconditional. Runs on every `start()` invocation once the environment and platform checks have passed, regardless of cloud environment or platform. The Azure Functions use case motivated the change; applying it universally keeps the code simple and prevents future collisions in other serverless hosts without requiring another code change.

### Environment variables

Four variables are overridden:

- `DD_TRACE_PIPE_NAME`
- `DD_TRACE_WINDOWS_PIPE_NAME`
- `DD_DOGSTATSD_PIPE_NAME`
- `DD_DOGSTATSD_WINDOWS_PIPE_NAME`

All four are user-configurable. We ignore whatever the user set and write fresh values.

### Generation

Two independent UUIDs per process:

- `traceId = randomUUID()` — used for both `DD_TRACE_PIPE_NAME` and `DD_TRACE_WINDOWS_PIPE_NAME`.
- `dogstatsdId = randomUUID()` — used for both dogstatsd variables.

Keeping the tracer and dogstatsd channels on distinct pipes isolates the two telemetry streams.

### Name format

Short form (no `\\.\pipe\` prefix — the tracer/dogstatsd clients prepend it):

- Trace: `datadog-trace-<uuid>` — 44 chars
- DogStatsD: `datadog-dogstatsd-<uuid>` — 48 chars

Both are well below the 256-char Windows named-pipe limit.

### Pre-existing value detection

A variable counts as "set" when `process.env[var]` is a non-empty string after `.trim()`. Empty strings and whitespace-only values are treated as unset and produce no warning. This matches the existing pattern used at `src/index.ts:85` for `DD_AZURE_RESOURCE_GROUP`.

The snapshot of pre-existing values is taken before any mutation.

### Warning emission

For each pre-existing value, emit exactly one warning:

```
<VAR_NAME> was set to '<prior>' but is being overridden to avoid named-pipe collisions. New value: '<new>'
```

Zero pre-existing values → zero warnings. All four pre-existing → four warnings.

A debug-level line also records the final four names for troubleshooting.

### Length defense

Even with the fixed format, assert both names fit within 256 chars as a safety net for future format changes:

```ts
if (tracePipeName.length > 256 || dogstatsdPipeName.length > 256) {
  logger.error(`Generated pipe name exceeds 256 chars; skipping unique-pipe override`);
  return;
}
```

If the guard fires, the function returns without mutation and `start()` proceeds with whatever the user had set.

### Failure isolation

Wrap generation and assignment in `try/catch`. If `randomUUID` or anything else throws, log an error and return. `start()` continues normally — worst case we fall back to today's collision-prone behavior rather than crash.

## Sequence

1. `start()` runs environment and platform checks.
2. `start()` runs the Azure Flex consumption guard.
3. `start()` calls `assignUniquePipeNames(logger)`.
   - Snapshot pre-existing values of the four env vars.
   - Generate two UUIDs.
   - Assert name length ≤ 256.
   - Write the four env vars.
   - Emit one warning per pre-existing var.
   - Emit one debug line with the final values.
4. `start()` resolves the binary path.
5. `start()` clones `process.env` into the spawn env (now includes the four overrides).
6. `start()` spawns the child binary.

## Testing

### Unit tests — `src/utils/pipe-name.spec.ts`

1. Trace UUID and dogstatsd UUID are distinct across one call.
2. With no pre-existing env state, all four vars are populated.
3. Intra-pair equality: `DD_TRACE_PIPE_NAME === DD_TRACE_WINDOWS_PIPE_NAME`; same for the dogstatsd pair.
4. Name format matches `^datadog-trace-[0-9a-f-]{36}$` and `^datadog-dogstatsd-[0-9a-f-]{36}$`.
5. Warning matrix, parametrized over each of the four vars being pre-set: exactly one `logger.warn` per pre-set var, carrying both prior and new values. Zero pre-set → zero warnings. All four pre-set → four warnings.
6. Empty and whitespace-only pre-existing values are treated as unset; no warning.
7. When a prior value was set, the final env value is the new UUID, never the prior.
8. Generated names are ≤ 256 chars.

### Integration test — `src/index.spec.ts`

9. `start()` spawns the child with an `env` object containing all four `DD_*_PIPE_NAME` vars matching the expected format, and the values were assigned before the spawn call.

Env isolation follows the existing pattern (`baseEnv` snapshot in `beforeEach`, restore in `afterEach`).

## Open questions

None.

## Out of scope / future work

- Deterministic pipe names derived from function identity (would allow process restarts to reuse the same pipe).
- Applying this to other `datadog-serverless-compat-*` language packages.
- Coordinated naming scheme if a single process needs more than one tracer or dogstatsd instance.
