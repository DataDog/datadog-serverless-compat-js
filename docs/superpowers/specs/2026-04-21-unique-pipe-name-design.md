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

Call site: `src/index.ts` `start()` invokes `assignUniquePipeNames(logger)` as the first statement inside its existing `try` block (`src/index.ts:125`), before `getBinaryPath`. The subsequent `env` clone (`src/index.ts:150-153`) picks up the mutations and the child inherits them. Placing the call inside the `try` block means any thrown error is caught by `start()`'s existing handler, logged, and the binary is not spawned.

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

A single debug-level line also records the final values of all four variables for troubleshooting.

### Length enforcement

Enforce the 256-char Windows limit by throwing if either generated name exceeds it:

```ts
if (tracePipeName.length > 256 || dogstatsdPipeName.length > 256) {
  throw new Error(`Generated pipe name exceeds 256 chars (trace=${tracePipeName.length}, dogstatsd=${dogstatsdPipeName.length})`);
}
```

The fixed format (44 / 48 chars) makes this mathematically impossible to hit in practice — the check is a guard against future format changes that accidentally violate the constraint. Any violation is a programming bug; fail loudly.

The throw propagates to `start()`'s existing `try/catch` (`src/index.ts:157-161`), which logs the error and aborts the spawn. The binary does not start rather than start with a potentially-colliding pipe name.

### Failure isolation

`assignUniquePipeNames` does not wrap its own `try/catch`. Any error (length violation, `randomUUID` throwing, etc.) propagates to `start()`'s existing `try/catch` block. The behavior on any error is: log, do not spawn the binary. This is stricter than the previous design's "log and continue" because we have no expected failure modes — anything that goes wrong here is a bug, and shipping no telemetry is preferable to shipping colliding telemetry.

## Sequence

1. `start()` runs environment and platform checks.
2. `start()` runs the Azure Flex consumption guard.
3. `start()` enters its `try` block.
4. `start()` calls `assignUniquePipeNames(logger)`:
   - Snapshot pre-existing values of the four env vars.
   - Generate two UUIDs.
   - Build trace and dogstatsd names; throw if either exceeds 256 chars.
   - Write the four env vars.
   - Emit one warning per pre-existing var.
   - Emit one debug line with the final values.
5. `start()` resolves the binary path.
6. `start()` clones `process.env` into the spawn env (now includes the four overrides).
7. `start()` spawns the child binary.

If step 4 throws, `start()`'s `catch` logs the error and steps 5-7 do not execute.

## Testing

### Unit tests — `src/utils/pipe-name.spec.ts`

1. Trace UUID and dogstatsd UUID are distinct across one call.
2. With no pre-existing env state, all four vars are populated.
3. Intra-pair equality: `DD_TRACE_PIPE_NAME === DD_TRACE_WINDOWS_PIPE_NAME`; same for the dogstatsd pair.
4. Name format matches `^datadog-trace-[0-9a-f-]{36}$` and `^datadog-dogstatsd-[0-9a-f-]{36}$`.
5. Warning matrix, parametrized over each of the four vars being pre-set: exactly one `logger.warn` per pre-set var, carrying both prior and new values. Zero pre-set → zero warnings. All four pre-set → four warnings.
6. Empty and whitespace-only pre-existing values are treated as unset; no warning.
7. When a prior value was set, the final env value is the new UUID, never the prior.
8. Generated names are ≤ 256 chars (assert on the produced values).
9. A forced length violation (e.g., by stubbing `randomUUID` to return an oversized string via a test-only seam, or by unit-testing an extracted length-check helper) throws an `Error` whose message names both lengths and does not mutate `process.env`.

### Integration test — `src/index.spec.ts`

10. `start()` spawns the child with an `env` object containing all four `DD_*_PIPE_NAME` vars matching the expected format, and the values were assigned before the spawn call.

Env isolation follows the existing pattern (`baseEnv` snapshot in `beforeEach`, restore in `afterEach`).

## Open questions

None.

## Out of scope / future work

- Deterministic pipe names derived from function identity (would allow process restarts to reuse the same pipe).
- Applying this to other `datadog-serverless-compat-*` language packages.
- Coordinated naming scheme if a single process needs more than one tracer or dogstatsd instance.
