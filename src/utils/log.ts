/* eslint-disable no-console */

export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (err: Error | string) => void;
}

const DD_LOG_LEVEL = process.env.DD_LOG_LEVEL;
const LOGGER_NAME = 'datadog-serverless-compat';

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

/**
 * Get the function caller's file location (filename:line) using V8's CallSite API
 * @returns formatted string like "filename.ts:42"
 */
function getCallerInfo(): string {
  // Temporarily configure V8's Error.prepareStackTrace to return CallSite objects
  // CallSite API: https://v8.dev/docs/stack-trace-api
  const originalPrepareStackTrace = Error.prepareStackTrace;

  try {
    Error.prepareStackTrace = (_err: Error, stack: NodeJS.CallSite[]) => stack;

    const obj: { stack?: NodeJS.CallSite[] } = {};
    Error.captureStackTrace(obj);
    const stack = obj.stack;

    if (!stack || stack.length < 3) {
      return 'unknown:0';
    }

    // Find the first call site outside of log.ts
    for (let i = 1; i < stack.length; i++) {
      const callSite = stack[i];
      const fileName = callSite.getFileName();
      if (fileName && !fileName.includes('log.ts') && !fileName.includes('log.js')) {
        const lineNumber = callSite.getLineNumber();
        if (lineNumber) {
          const filename = fileName.split('/').pop() || fileName;
          return `${filename}:${lineNumber}`;
        }
      }
    }

    return 'unknown:0';
  } catch (err) {
    return 'unknown:0';
  } finally {
    // Restore the original prepareStackTrace to avoid side effects
    Error.prepareStackTrace = originalPrepareStackTrace;
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
          const message = err instanceof Error ? err.message : err;
          console.error(formatLog('ERROR', message));
        }
      : () => { },
};

export default log;
