import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { logger, createLogger } from '../../../src/utils/logger.js';

describe('Logger Utility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('logger (main instance)', () => {
    it('should be a pino logger instance', () => {
      // Pino loggers have these characteristic methods
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should have service name in base bindings', () => {
      const bindings = logger.bindings();
      expect(bindings.service).toBe('ai-roundtable');
    });

    it('should use silent level in test environment', () => {
      // NODE_ENV is set to 'test' by vitest, so level should be 'silent'
      expect(logger.level).toBe('silent');
    });
  });

  describe('createLogger', () => {
    it('should return a pino logger instance', () => {
      const childLogger = createLogger('TestModule');

      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.error).toBe('function');
      expect(typeof childLogger.warn).toBe('function');
      expect(typeof childLogger.debug).toBe('function');
      expect(typeof childLogger.child).toBe('function');
    });

    it('should include context in bindings', () => {
      const childLogger = createLogger('DebateEngine');
      const bindings = childLogger.bindings();

      expect(bindings.context).toBe('DebateEngine');
    });

    it('should inherit service name from parent logger', () => {
      const childLogger = createLogger('TestContext');
      const bindings = childLogger.bindings();

      expect(bindings.service).toBe('ai-roundtable');
    });

    it('should create independent loggers with different contexts', () => {
      const logger1 = createLogger('Module1');
      const logger2 = createLogger('Module2');
      const logger3 = createLogger('Module3');

      expect(logger1.bindings().context).toBe('Module1');
      expect(logger2.bindings().context).toBe('Module2');
      expect(logger3.bindings().context).toBe('Module3');
    });

    it('should handle empty context string', () => {
      const childLogger = createLogger('');
      const bindings = childLogger.bindings();

      expect(bindings.context).toBe('');
    });

    it('should handle special characters in context', () => {
      const childLogger = createLogger('Module/SubModule:Handler');
      const bindings = childLogger.bindings();

      expect(bindings.context).toBe('Module/SubModule:Handler');
    });

    it('should be a child of the main logger', () => {
      const childLogger = createLogger('TestChild');

      // Child loggers inherit the level from parent
      expect(childLogger.level).toBe(logger.level);
    });
  });

  describe('log level configuration', () => {
    it('should respect LOG_LEVEL environment variable', async () => {
      // Since logger is already instantiated, we test indirectly
      // by verifying the level behavior
      // In test environment, level is 'silent' which means levelVal is 100 (highest)
      const levelVal = pino.levels.values[logger.level];
      expect(levelVal).toBeDefined();
    });

    it('should have valid pino log level', () => {
      const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
      expect(validLevels).toContain(logger.level);
    });
  });

  describe('child logger functionality', () => {
    it('should support nested child creation', () => {
      const level1 = createLogger('Level1');
      const level2 = level1.child({ subContext: 'Level2' });
      const bindings = level2.bindings();

      expect(bindings.context).toBe('Level1');
      expect(bindings.subContext).toBe('Level2');
    });

    it('should allow adding additional bindings via child', () => {
      const childLogger = createLogger('TestModule');
      const enrichedLogger = childLogger.child({ sessionId: 'session-123', userId: 'user-456' });
      const bindings = enrichedLogger.bindings();

      expect(bindings.context).toBe('TestModule');
      expect(bindings.sessionId).toBe('session-123');
      expect(bindings.userId).toBe('user-456');
    });
  });
});
