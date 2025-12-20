import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEnvOrThrow,
  getEnvWithDefault,
  getEnvOptional,
  hasEnv,
  getEnvBoolean,
  getEnvNumber,
} from '../../../src/utils/env.js';

describe('Environment Variable Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnvOrThrow', () => {
    it('should return value when env var is set', () => {
      process.env.TEST_VAR = 'test-value';
      expect(getEnvOrThrow('TEST_VAR')).toBe('test-value');
    });

    it('should throw when env var is not set', () => {
      delete process.env.TEST_VAR;
      expect(() => getEnvOrThrow('TEST_VAR')).toThrow(
        'Environment variable TEST_VAR is required but not set'
      );
    });

    it('should include description in error message', () => {
      delete process.env.TEST_VAR;
      expect(() => getEnvOrThrow('TEST_VAR', 'Test variable')).toThrow(
        'Environment variable TEST_VAR (Test variable) is required but not set'
      );
    });

    it('should throw when env var is empty string', () => {
      process.env.TEST_VAR = '';
      expect(() => getEnvOrThrow('TEST_VAR')).toThrow();
    });
  });

  describe('getEnvWithDefault', () => {
    it('should return value when env var is set', () => {
      process.env.TEST_VAR = 'custom-value';
      expect(getEnvWithDefault('TEST_VAR', 'default')).toBe('custom-value');
    });

    it('should return default when env var is not set', () => {
      delete process.env.TEST_VAR;
      expect(getEnvWithDefault('TEST_VAR', 'default-value')).toBe('default-value');
    });

    it('should return empty string if set to empty', () => {
      process.env.TEST_VAR = '';
      // Empty string is falsy, so default is returned
      expect(getEnvWithDefault('TEST_VAR', 'default')).toBe('default');
    });
  });

  describe('getEnvOptional', () => {
    it('should return value when env var is set', () => {
      process.env.TEST_VAR = 'value';
      expect(getEnvOptional('TEST_VAR')).toBe('value');
    });

    it('should return undefined when env var is not set', () => {
      delete process.env.TEST_VAR;
      expect(getEnvOptional('TEST_VAR')).toBeUndefined();
    });
  });

  describe('hasEnv', () => {
    it('should return true when env var is set', () => {
      process.env.TEST_VAR = 'value';
      expect(hasEnv('TEST_VAR')).toBe(true);
    });

    it('should return false when env var is not set', () => {
      delete process.env.TEST_VAR;
      expect(hasEnv('TEST_VAR')).toBe(false);
    });

    it('should return false when env var is empty string', () => {
      process.env.TEST_VAR = '';
      expect(hasEnv('TEST_VAR')).toBe(false);
    });
  });

  describe('getEnvBoolean', () => {
    it('should return true for "true"', () => {
      process.env.TEST_VAR = 'true';
      expect(getEnvBoolean('TEST_VAR')).toBe(true);
    });

    it('should return true for "1"', () => {
      process.env.TEST_VAR = '1';
      expect(getEnvBoolean('TEST_VAR')).toBe(true);
    });

    it('should return true for "yes"', () => {
      process.env.TEST_VAR = 'yes';
      expect(getEnvBoolean('TEST_VAR')).toBe(true);
    });

    it('should return true for "TRUE" (case-insensitive)', () => {
      process.env.TEST_VAR = 'TRUE';
      expect(getEnvBoolean('TEST_VAR')).toBe(true);
    });

    it('should return false for other values', () => {
      process.env.TEST_VAR = 'false';
      expect(getEnvBoolean('TEST_VAR')).toBe(false);

      process.env.TEST_VAR = '0';
      expect(getEnvBoolean('TEST_VAR')).toBe(false);

      process.env.TEST_VAR = 'no';
      expect(getEnvBoolean('TEST_VAR')).toBe(false);
    });

    it('should return default when not set', () => {
      delete process.env.TEST_VAR;
      expect(getEnvBoolean('TEST_VAR', false)).toBe(false);
      expect(getEnvBoolean('TEST_VAR', true)).toBe(true);
    });
  });

  describe('getEnvNumber', () => {
    it('should return parsed number when valid', () => {
      process.env.TEST_VAR = '42';
      expect(getEnvNumber('TEST_VAR', 0)).toBe(42);
    });

    it('should return default for non-numeric value', () => {
      process.env.TEST_VAR = 'not-a-number';
      expect(getEnvNumber('TEST_VAR', 100)).toBe(100);
    });

    it('should return default when not set', () => {
      delete process.env.TEST_VAR;
      expect(getEnvNumber('TEST_VAR', 60000)).toBe(60000);
    });

    it('should handle negative numbers', () => {
      process.env.TEST_VAR = '-10';
      expect(getEnvNumber('TEST_VAR', 0)).toBe(-10);
    });
  });
});
