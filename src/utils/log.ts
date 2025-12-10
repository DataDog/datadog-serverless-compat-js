/* eslint-disable no-console */

import { sep } from 'path';

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
 * Format the log with level, name of the serverless package, and call site location
 * Format: LEVEL [name] [location] - message
 */
function formatLog(level: string, location: string, message: string): string {
  return `${level} [${LOGGER_NAME}] [${location}] - ${message}`;
}

/**
 * Create a logger instance with a specific call site name.
 * The call site name is typically the filename (e.g., __filename) to provide caller context.
 * 
 * @param callSite - The name or path of the file creating the logger (e.g., __filename)
 * @returns A Logger instance configured for the specified call site
 * 
 * @example
 * ```typescript
 * import { logger } from './utils/log';
 * const log = logger(__filename);
 * log.info('Starting process');
 * ```
 */
export function logger(callSite: string): Logger {
  // Extract just the filename from the full path
  const location = callSite.split(sep).pop() || callSite;

  return {
    debug:
      logLevel <= 20
        ? (msg: string) => (console.debug || console.log)(formatLog('DEBUG', location, msg))
        : () => { },
    info: logLevel <= 30 ? (msg: string) => console.info(formatLog('INFO', location, msg)) : () => { },
    warn: logLevel <= 40 ? (msg: string) => console.warn(formatLog('WARN', location, msg)) : () => { },
    error:
      logLevel <= 50
        ? (err: string | Error) => {
            if (err instanceof Error) {
              const formatted = formatLog('ERROR', location, err.message);
              // Preserve the stack trace but replace the first line with our formatted message
              if (err.stack) {
                const stackLines = err.stack.split('\n');
                stackLines[0] = formatted; // Replace "Error: message" with formatted message
                console.error(stackLines.join('\n'));
              } else {
                console.error(formatted);
              }
            } else {
              console.error(formatLog('ERROR', location, err));
            }
          }
        : () => { },
  };
}
