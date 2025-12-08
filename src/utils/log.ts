/* eslint-disable no-console */

import { sep, join } from 'path';

export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (err: Error | string) => void;
}

const DD_LOG_LEVEL = process.env.DD_LOG_LEVEL;
const LOGGER_NAME = 'datadog-serverless-compat';

// Limit the stack trace for performance by default. We're only interested in where log is called, not the whole trace.
let STACK_TRACE_LIMIT = 5;

/**
 * Set the stack trace limit for log location tracking.
 * Lower values improve performance but may miss the caller in deep call stacks.
 * @param limit - Maximum number of stack frames to capture (default: 5)
 */
export function setStackTraceLimit(limit: number): void {
  STACK_TRACE_LIMIT = limit;
}

const logLevels: Record<string, number> = {
  trace: 20,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  critical: 50,
  off: 100,
};

const levelKey = (DD_LOG_LEVEL || 'info').toLowerCase();
const logLevel: number = logLevels[levelKey] ?? logLevels.info;
const defaultLocation = 'unknown:0';


/**
 * Get the log function caller's file location (filename:line)
 * @returns formatted string like "filename.ts:42"
 */
function getCallerInfo(): string {
  // Temporarily configure V8's Error.prepareStackTrace to return CallSite objects
  // CallSite API: https://v8.dev/docs/stack-trace-api
  const originalPrepareStackTrace = Error.prepareStackTrace;
  const originalStackTraceLimit = Error.stackTraceLimit;

  try {
    Error.prepareStackTrace = (_err: Error, stack: NodeJS.CallSite[]) => stack;
    Error.stackTraceLimit = STACK_TRACE_LIMIT;

    const obj: { stack?: NodeJS.CallSite[] } = {};
    Error.captureStackTrace(obj);
    const stack = obj.stack;

    if (!stack) {
      return defaultLocation;
    }

    // Find the first call site outside of log.ts
    for (let i = 1; i < stack.length; i++) {
      const callSite = stack[i];
      let fileName = callSite.getFileName();
      let lineNumber = callSite.getLineNumber();

      // Handle eval contexts by using getEvalOrigin
      if (!fileName && callSite.isEval()) {
        const evalOrigin = callSite.getEvalOrigin();
        if (evalOrigin) {
          // Parse the eval origin to extract the file location
          // Example formats:
          // "eval at Foo.a (myscript.js:10:3)"
          // "eval at Foo.a (eval at Bar.z (myscript.js:10:3))"
          // For nested evals, we want the innermost (last) file location
          const fileMatches = Array.from(evalOrigin.matchAll(/([^/\\()\s:]+):(\d+):\d+/g));
          const lastMatch = fileMatches[fileMatches.length - 1];
          if (lastMatch) {
            fileName = fileName || lastMatch[1];
            lineNumber = lineNumber || parseInt(lastMatch[2]);
          }
        }
      }

      // Skip if no filename and skip the logger file itself. Package is serverless-compat, repo is datadog-serverless-compat-js.
      if (!fileName || fileName.endsWith(join(sep, 'serverless-compat', 'src', 'utils', 'log.ts')) || fileName.endsWith(join(sep, 'datadog-serverless-compat-js', 'src', 'utils', 'log.ts'))) {
        continue;
      }

      if (fileName && lineNumber) {
        const filename = fileName.split(sep).pop() || fileName;
        return `${filename}:${lineNumber}`;
      }
    }

    return defaultLocation;
  } catch (err) {
    return defaultLocation;
  } finally {
    // Restore the original prepareStackTrace to avoid side effects
    Error.prepareStackTrace = originalPrepareStackTrace;
    Error.stackTraceLimit = originalStackTraceLimit;
  }
}

/**
 * Format the log with level, name of the serverless package formatting the log, and line number
 * Format: LEVEL [name] [filename:line] - message
 */
function formatLog(level: string, message: string): string {
  const location = getCallerInfo();
  return `${level} [${LOGGER_NAME}] [${location}] - ${message}`;
}

export const log: Logger = {
  debug:
    logLevel <= 20
      ? (msg: string) => (console.debug || console.log)(formatLog('DEBUG', msg))
      : () => { },
  info: logLevel <= 30 ? (msg: string) => console.info(formatLog('INFO', msg)) : () => { },
  warn: logLevel <= 40 ? (msg: string) => console.warn(formatLog('WARN', msg)) : () => { },
  error:
    logLevel <= 50
      ? (err: string | Error) => {
          if (err instanceof Error) {
            const formatted = formatLog('ERROR', err.message);
            // Log with the formatted message and original stack, but avoid mutating the original error.
            const formattedError = new Error(formatted);
            formattedError.stack = err.stack;
            console.error(formattedError);
          } else {
            console.error(formatLog('ERROR', err));
          }
        }
      : () => { },
};

export default log;
