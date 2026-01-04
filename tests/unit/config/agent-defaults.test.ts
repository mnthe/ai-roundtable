import { describe, it, expect } from 'vitest';
import { AGENT_DEFAULTS } from '../../../src/config/agent-defaults.js';

describe('Agent Defaults Configuration', () => {
  describe('AGENT_DEFAULTS', () => {
    it('should have TEMPERATURE set to 0.7', () => {
      expect(AGENT_DEFAULTS.TEMPERATURE).toBe(0.7);
    });

    it('should have MAX_TOKENS set to 4096', () => {
      expect(AGENT_DEFAULTS.MAX_TOKENS).toBe(4096);
    });

    it('should have MAX_TOOL_ITERATIONS set to 10', () => {
      expect(AGENT_DEFAULTS.MAX_TOOL_ITERATIONS).toBe(10);
    });

    it('should have MAX_RETRIES set to 3', () => {
      expect(AGENT_DEFAULTS.MAX_RETRIES).toBe(3);
    });

    it('should have RETRY_BASE_DELAY_MS set to 1000', () => {
      expect(AGENT_DEFAULTS.RETRY_BASE_DELAY_MS).toBe(1000);
    });

    it('should have RATE_LIMIT_WAIT_THRESHOLD_MS set to 60000', () => {
      expect(AGENT_DEFAULTS.RATE_LIMIT_WAIT_THRESHOLD_MS).toBe(60000);
    });
  });

  describe('type safety', () => {
    it('should be readonly (const assertion)', () => {
      expect(Object.isFrozen(AGENT_DEFAULTS)).toBe(false);
      expect(typeof AGENT_DEFAULTS).toBe('object');
    });

    it('should have all expected keys', () => {
      const expectedKeys = [
        'TEMPERATURE',
        'MAX_TOKENS',
        'MAX_TOOL_ITERATIONS',
        'MAX_RETRIES',
        'RETRY_BASE_DELAY_MS',
        'RATE_LIMIT_WAIT_THRESHOLD_MS',
      ];

      expect(Object.keys(AGENT_DEFAULTS).sort()).toEqual(expectedKeys.sort());
    });
  });
});
