/* eslint-disable no-console */

export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (err: Error | string) => void;
}

const DD_LOG_LEVEL = process.env.DD_LOG_LEVEL;

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

export const log: Logger = {
  debug:
    logLevel <= 20
      ? (msg: string) => (console.debug || console.log)(msg)
      : () => { },
  info: logLevel <= 30 ? (msg: string) => console.info(msg) : () => { },
  warn: logLevel <= 40 ? (msg: string) => console.warn(msg) : () => { },
  error:
    logLevel <= 50 ? (err: string | Error) => console.error(err) : () => { },
};

export default log;
