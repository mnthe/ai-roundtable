import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  detectApiKeys,
  checkProviderAvailability,
  setupProviders,
  createDefaultAgents,
  setupAgents,
  getAvailabilityReport,
  type ApiKeyConfig,
} from '../../../src/agents/setup.js';
import { AgentRegistry } from '../../../src/agents/registry.js';

describe('Setup Module', () => {
  describe('detectApiKeys', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment before each test
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should detect all API keys from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.GOOGLE_AI_API_KEY = 'test-google-key';
      process.env.PERPLEXITY_API_KEY = 'test-perplexity-key';

      const keys = detectApiKeys();

      expect(keys.anthropic).toBe('test-anthropic-key');
      expect(keys.openai).toBe('test-openai-key');
      expect(keys.google).toBe('test-google-key');
      expect(keys.perplexity).toBe('test-perplexity-key');
    });

    it('should return undefined for missing keys', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;

      const keys = detectApiKeys();

      expect(keys.anthropic).toBeUndefined();
      expect(keys.openai).toBeUndefined();
      expect(keys.google).toBeUndefined();
      expect(keys.perplexity).toBeUndefined();
    });

    it('should detect partial API keys', () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.OPENAI_API_KEY = 'test-openai-key';
      delete process.env.GOOGLE_AI_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;

      const keys = detectApiKeys();

      expect(keys.anthropic).toBeUndefined();
      expect(keys.openai).toBe('test-openai-key');
      expect(keys.google).toBeUndefined();
      expect(keys.perplexity).toBeUndefined();
    });
  });

  describe('checkProviderAvailability', () => {
    it('should mark providers as available when keys are present', () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
        openai: 'key2',
        google: 'key3',
        perplexity: 'key4',
      };

      const availability = checkProviderAvailability(apiKeys);

      expect(availability).toHaveLength(4);
      expect(availability.every((p) => p.available)).toBe(true);
      expect(availability.every((p) => p.reason === undefined)).toBe(true);
    });

    it('should mark providers as unavailable when keys are missing', () => {
      const apiKeys: ApiKeyConfig = {};

      const availability = checkProviderAvailability(apiKeys);

      expect(availability).toHaveLength(4);
      expect(availability.every((p) => !p.available)).toBe(true);
      expect(availability.every((p) => p.reason !== undefined)).toBe(true);
    });

    it('should handle partial keys', () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
        openai: undefined,
        google: 'key3',
        perplexity: undefined,
      };

      const availability = checkProviderAvailability(apiKeys);

      const anthropic = availability.find((p) => p.provider === 'anthropic');
      const openai = availability.find((p) => p.provider === 'openai');
      const google = availability.find((p) => p.provider === 'google');
      const perplexity = availability.find((p) => p.provider === 'perplexity');

      expect(anthropic?.available).toBe(true);
      expect(openai?.available).toBe(false);
      expect(google?.available).toBe(true);
      expect(perplexity?.available).toBe(false);
    });
  });

  describe('setupProviders', () => {
    let registry: AgentRegistry;

    beforeEach(() => {
      registry = new AgentRegistry();
    });

    it('should register providers for available API keys', () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'test-key',
      };

      const result = setupProviders(registry, apiKeys);

      expect(registry.hasProvider('anthropic')).toBe(true);
      expect(registry.hasProvider('openai')).toBe(false);
      expect(registry.hasProvider('google')).toBe(false);
      expect(registry.hasProvider('perplexity')).toBe(false);
      expect(result.warnings).toContain('GPT-4 agent not available: OPENAI_API_KEY not set');
      expect(result.warnings).toContain('Gemini agent not available: GOOGLE_AI_API_KEY not set');
      expect(result.warnings).toContain('Perplexity agent not available: PERPLEXITY_API_KEY not set');
    });

    it('should register all providers when all keys are available', () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
        openai: 'key2',
        google: 'key3',
        perplexity: 'key4',
      };

      const result = setupProviders(registry, apiKeys);

      expect(registry.hasProvider('anthropic')).toBe(true);
      expect(registry.hasProvider('openai')).toBe(true);
      expect(registry.hasProvider('google')).toBe(true);
      expect(registry.hasProvider('perplexity')).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn when no keys are available', () => {
      const apiKeys: ApiKeyConfig = {};

      const result = setupProviders(registry, apiKeys);

      expect(registry.getRegisteredProviders()).toHaveLength(0);
      expect(result.warnings).toHaveLength(4);
    });

    it('should return provider availability', () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
        openai: undefined,
      };

      const result = setupProviders(registry, apiKeys);

      const anthropicAvailability = result.providers.find((p) => p.provider === 'anthropic');
      const openaiAvailability = result.providers.find((p) => p.provider === 'openai');

      expect(anthropicAvailability?.available).toBe(true);
      expect(openaiAvailability?.available).toBe(false);
    });
  });

  describe('createDefaultAgents', () => {
    let registry: AgentRegistry;

    beforeEach(() => {
      registry = new AgentRegistry();
    });

    it('should create default agents for registered providers', () => {
      // First setup providers
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
        openai: 'key2',
      };
      setupProviders(registry, apiKeys);

      const agents = createDefaultAgents(registry);

      expect(agents).toHaveLength(2);
      expect(agents.some((a) => a.id === 'anthropic-default')).toBe(true);
      expect(agents.some((a) => a.id === 'openai-default')).toBe(true);
    });

    it('should use default names for agents', () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
      };
      setupProviders(registry, apiKeys);

      const agents = createDefaultAgents(registry);

      expect(agents[0]?.name).toBe('Claude');
    });

    it('should create no agents when no providers are registered', () => {
      const agents = createDefaultAgents(registry);

      expect(agents).toHaveLength(0);
    });
  });

  describe('setupAgents', () => {
    let registry: AgentRegistry;

    beforeEach(() => {
      registry = new AgentRegistry();
    });

    it('should setup providers and create default agents', () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
        openai: 'key2',
      };

      const result = setupAgents(registry, apiKeys);

      expect(registry.hasProvider('anthropic')).toBe(true);
      expect(registry.hasProvider('openai')).toBe(true);
      expect(result.agents).toHaveLength(2);
      expect(registry.hasAgent('anthropic-default')).toBe(true);
      expect(registry.hasAgent('openai-default')).toBe(true);
    });

    it('should warn when no agents are available', () => {
      const apiKeys: ApiKeyConfig = {};

      const result = setupAgents(registry, apiKeys);

      expect(result.agents).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes('No agents available'))).toBe(true);
    });

    it('should return complete setup result', () => {
      const apiKeys: ApiKeyConfig = {
        google: 'key1',
        perplexity: 'key2',
      };

      const result = setupAgents(registry, apiKeys);

      expect(result.providers).toHaveLength(4);
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('getAvailabilityReport', () => {
    it('should generate readable report', () => {
      const result = {
        providers: [
          { provider: 'anthropic' as const, available: true },
          { provider: 'openai' as const, available: false, reason: 'OPENAI_API_KEY not set' },
          { provider: 'google' as const, available: true },
          { provider: 'perplexity' as const, available: false, reason: 'PERPLEXITY_API_KEY not set' },
        ],
        agents: [
          {
            id: 'anthropic-default',
            name: 'Claude',
            provider: 'anthropic' as const,
            model: 'claude-3-5-sonnet-20241022',
          },
          {
            id: 'google-default',
            name: 'Gemini',
            provider: 'google' as const,
            model: 'gemini-1.5-pro',
          },
        ],
        warnings: ['GPT-4 agent not available: OPENAI_API_KEY not set'],
      };

      const report = getAvailabilityReport(result);

      expect(report).toContain('AI Roundtable');
      expect(report).toContain('anthropic');
      expect(report).toContain('openai');
      expect(report).toContain('Claude');
      expect(report).toContain('Gemini');
      expect(report).toContain('OPENAI_API_KEY not set');
    });

    it('should handle empty agents list', () => {
      const result = {
        providers: [
          { provider: 'anthropic' as const, available: false, reason: 'No key' },
        ],
        agents: [],
        warnings: [],
      };

      const report = getAvailabilityReport(result);

      expect(report).toContain('No agents registered');
    });
  });
});
