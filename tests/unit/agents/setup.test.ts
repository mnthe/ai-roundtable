import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  detectApiKeys,
  checkProviderAvailability,
  setupProviders,
  createDefaultAgents,
  setupAgents,
  runHealthChecks,
  getAvailabilityReport,
  type ApiKeyConfig,
} from '../../../src/agents/setup.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import { MockAgent } from '../../../src/agents/base.js';

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
      process.env.GOOGLE_API_KEY = 'test-google-key';
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
      delete process.env.GOOGLE_API_KEY;
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
      delete process.env.GOOGLE_API_KEY;
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
      expect(result.warnings).toContain('ChatGPT agent not available: OPENAI_API_KEY not set');
      expect(result.warnings).toContain('Gemini agent not available: GOOGLE_API_KEY not set');
      expect(result.warnings).toContain(
        'Perplexity agent not available: PERPLEXITY_API_KEY not set'
      );
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

  describe('runHealthChecks', () => {
    let registry: AgentRegistry;

    beforeEach(() => {
      registry = new AgentRegistry();
    });

    it('should check health of all agents', async () => {
      // Create mock agents - one healthy, one unhealthy
      const healthyAgent = new MockAgent({
        id: 'healthy-agent',
        name: 'Healthy Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      const unhealthyAgent = new MockAgent({
        id: 'unhealthy-agent',
        name: 'Unhealthy Agent',
        provider: 'openai',
        model: 'test-model',
      });

      // Mock health check responses
      vi.spyOn(healthyAgent, 'healthCheck').mockResolvedValue({ healthy: true });
      vi.spyOn(unhealthyAgent, 'healthCheck').mockResolvedValue({
        healthy: false,
        error: 'API connection failed',
      });

      // Register mock provider and agents
      registry.registerProvider('anthropic', () => healthyAgent, 'test-model');
      registry.registerProvider('openai', () => unhealthyAgent, 'test-model');

      // Manually add agents to registry (bypassing factory)
      registry['agents'].set('healthy-agent', { agent: healthyAgent, active: true });
      registry['agents'].set('unhealthy-agent', { agent: unhealthyAgent, active: true });

      const results = await runHealthChecks(registry);

      expect(results).toHaveLength(2);
      expect(results[0]?.healthy).toBe(true);
      expect(results[1]?.healthy).toBe(false);
      expect(results[1]?.error).toBe('API connection failed');

      // Verify registry status was updated
      expect(registry.isAgentActive('healthy-agent')).toBe(true);
      expect(registry.isAgentActive('unhealthy-agent')).toBe(false);
    });

    it('should deactivate unhealthy agents', async () => {
      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      vi.spyOn(agent, 'healthCheck').mockResolvedValue({
        healthy: false,
        error: 'Connection timeout',
      });

      registry.registerProvider('anthropic', () => agent, 'test-model');
      registry['agents'].set('test-agent', { agent, active: true });

      await runHealthChecks(registry);

      expect(registry.isAgentActive('test-agent')).toBe(false);
    });
  });

  describe('setupAgents', () => {
    let registry: AgentRegistry;

    beforeEach(() => {
      registry = new AgentRegistry();
    });

    it('should setup providers and create default agents', async () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
        openai: 'key2',
      };

      const result = await setupAgents(registry, apiKeys, { runHealthCheck: false });

      expect(registry.hasProvider('anthropic')).toBe(true);
      expect(registry.hasProvider('openai')).toBe(true);
      expect(result.agents).toHaveLength(2);
      expect(registry.hasAgent('anthropic-default')).toBe(true);
      expect(registry.hasAgent('openai-default')).toBe(true);
    });

    it('should warn when no agents are available', async () => {
      const apiKeys: ApiKeyConfig = {};

      const result = await setupAgents(registry, apiKeys);

      expect(result.agents).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes('No agents available'))).toBe(true);
    });

    it('should return complete setup result', async () => {
      const apiKeys: ApiKeyConfig = {
        google: 'key1',
        perplexity: 'key2',
      };

      const result = await setupAgents(registry, apiKeys, { runHealthCheck: false });

      expect(result.providers).toHaveLength(4);
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should skip health checks when runHealthCheck is false', async () => {
      const apiKeys: ApiKeyConfig = {
        anthropic: 'key1',
      };

      const result = await setupAgents(registry, apiKeys, { runHealthCheck: false });

      // All agents should remain active
      expect(registry.getActiveAgentIds()).toHaveLength(1);
    });
  });

  describe('getAvailabilityReport', () => {
    it('should generate readable report', () => {
      const result = {
        providers: [
          { provider: 'anthropic' as const, available: true },
          { provider: 'openai' as const, available: false, reason: 'OPENAI_API_KEY not set' },
          { provider: 'google' as const, available: true },
          {
            provider: 'perplexity' as const,
            available: false,
            reason: 'PERPLEXITY_API_KEY not set',
          },
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
        warnings: ['ChatGPT agent not available: OPENAI_API_KEY not set'],
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
        providers: [{ provider: 'anthropic' as const, available: false, reason: 'No key' }],
        agents: [],
        warnings: [],
      };

      const report = getAvailabilityReport(result);

      expect(report).toContain('No agents registered');
    });
  });
});
