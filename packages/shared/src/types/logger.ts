/**
 * Shared Log Level definitions
 * Used by both server and client logger implementations
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

type LogLevelName = keyof typeof LogLevel;

/**
 * Parse a string into a LogLevel.
 * Accepts names ("ERROR", "WARN", "INFO", "DEBUG", "VERBOSE") or numeric ("0"-"4").
 * Returns undefined if invalid.
 */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (value === undefined) return undefined;
  const upper = value.toUpperCase();
  if (upper in LogLevel) return LogLevel[upper as LogLevelName];
  const num = parseInt(value, 10);
  if (!isNaN(num) && num >= 0 && num <= 4) return num as LogLevel;
  return undefined;
}
