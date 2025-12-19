/**
 * Structured logging system using Pino
 */

import pino from 'pino';
import { createRequire } from 'module';

// Create require for ESM compatibility
const require = createRequire(import.meta.url);

/**
 * Determine if pretty printing should be used
 * Disabled in test environment and production
 */
function shouldUsePrettyPrint(): boolean {
  const env = process.env.NODE_ENV || '';
  return env !== 'production' && env !== 'test' && !process.env.CI;
}

/**
 * Check if pino-pretty is available
 * It may not be installed in npx/production environments
 */
function isPinoPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Main logger instance
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  ...(shouldUsePrettyPrint() && isPinoPrettyAvailable()
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  base: { service: 'ai-roundtable' },
});

/**
 * Create a child logger with specific context
 *
 * @param context - Context identifier (e.g., 'BaseAgent', 'DebateEngine')
 * @returns Child logger with context field
 *
 * @example
 * const log = createLogger('DebateEngine');
 * log.info({ sessionId: '123' }, 'Round started');
 */
export function createLogger(context: string): pino.Logger {
  return logger.child({ context });
}
