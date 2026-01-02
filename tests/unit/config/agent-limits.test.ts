import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadAgentLimitsConfig,
  DEFAULT_MAX_AGENTS,
  DEFAULT_AGENT_COUNT,
} from '../../../src/config/agent-limits.js';

describe('Agent Limits Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadAgentLimitsConfig', () => {
    it('should return default values when no env vars set', () => {
      delete process.env.ROUNDTABLE_MAX_AGENTS;
      delete process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT;

      const config = loadAgentLimitsConfig();

      expect(config.maxAgents).toBe(DEFAULT_MAX_AGENTS);
      expect(config.defaultCount).toBe(DEFAULT_AGENT_COUNT);
    });

    it('should use ROUNDTABLE_MAX_AGENTS when set', () => {
      process.env.ROUNDTABLE_MAX_AGENTS = '10';

      const config = loadAgentLimitsConfig();

      expect(config.maxAgents).toBe(10);
    });

    it('should use ROUNDTABLE_DEFAULT_AGENT_COUNT when set', () => {
      process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT = '3';

      const config = loadAgentLimitsConfig();

      expect(config.defaultCount).toBe(3);
    });

    it('should handle invalid number by falling back to default', () => {
      process.env.ROUNDTABLE_MAX_AGENTS = 'invalid';

      const config = loadAgentLimitsConfig();

      expect(config.maxAgents).toBe(DEFAULT_MAX_AGENTS);
    });

    it('should cap defaultCount at maxAgents', () => {
      process.env.ROUNDTABLE_MAX_AGENTS = '3';
      process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT = '10';

      const config = loadAgentLimitsConfig();

      expect(config.defaultCount).toBe(3);
    });
  });

  describe('DEFAULT_MAX_AGENTS', () => {
    it('should be 5', () => {
      expect(DEFAULT_MAX_AGENTS).toBe(5);
    });
  });

  describe('DEFAULT_AGENT_COUNT', () => {
    it('should be 4', () => {
      expect(DEFAULT_AGENT_COUNT).toBe(4);
    });
  });
});
