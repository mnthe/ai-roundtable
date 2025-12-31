import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPersonaAgents, type PersonaAgentOptions } from '../../../src/agents/persona-factory.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import type { AgentConfig } from '../../../src/types/index.js';

describe('createPersonaAgents', () => {
  let registry: AgentRegistry;
  let mockFactory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registry = new AgentRegistry();

    // Create mock factory that returns mock agents
    mockFactory = vi.fn((config: AgentConfig) => ({
      id: config.id,
      getInfo: () => config,
      setToolkit: vi.fn(),
      generateResponse: vi.fn(),
    }));

    // Register mock providers
    registry.registerProvider('anthropic', mockFactory as any, 'claude-sonnet-4-5');
    registry.registerProvider('openai', mockFactory as any, 'gpt-5.2');
  });

  describe('single provider', () => {
    it('should create agents with unique IDs', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 4,
        providers: ['anthropic'],
      };

      const agentIds = createPersonaAgents(registry, options);

      expect(agentIds).toHaveLength(4);
      expect(new Set(agentIds).size).toBe(4); // All unique
    });

    it('should create agents with persona system prompts', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 2,
        providers: ['anthropic'],
      };

      createPersonaAgents(registry, options);

      expect(mockFactory).toHaveBeenCalledTimes(2);

      const firstCall = mockFactory.mock.calls[0][0] as AgentConfig;
      expect(firstCall.systemPrompt).toContain('Synthesizer');
      expect(firstCall.systemPrompt).toContain('finding common ground');

      const secondCall = mockFactory.mock.calls[1][0] as AgentConfig;
      expect(secondCall.systemPrompt).toContain('Analyst');
    });
  });

  describe('multiple providers (round-robin)', () => {
    it('should distribute agents across providers', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 4,
        providers: ['anthropic', 'openai'],
      };

      createPersonaAgents(registry, options);

      // Check that we have calls to both providers
      const configs = mockFactory.mock.calls.map((call) => call[0] as AgentConfig);
      const providers = configs.map((c) => c.provider);

      expect(providers).toEqual(['anthropic', 'openai', 'anthropic', 'openai']);
    });

    it('should use correct models for each provider', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 2,
        providers: ['anthropic', 'openai'],
      };

      createPersonaAgents(registry, options);

      const configs = mockFactory.mock.calls.map((call) => call[0] as AgentConfig);

      expect(configs[0].model).toBe('claude-sonnet-4-5');
      expect(configs[1].model).toBe('gpt-5.2');
    });
  });

  describe('agent naming', () => {
    it('should name agents as Provider (PersonaName)', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 2,
        providers: ['anthropic'],
      };

      createPersonaAgents(registry, options);

      const configs = mockFactory.mock.calls.map((call) => call[0] as AgentConfig);

      expect(configs[0].name).toBe('Claude (Synthesizer)');
      expect(configs[1].name).toBe('Claude (Analyst)');
    });
  });

  describe('error handling', () => {
    it('should throw if no providers available', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 4,
        providers: [],
      };

      expect(() => createPersonaAgents(registry, options)).toThrow('No providers available');
    });

    it('should throw if provider not registered', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 4,
        providers: ['perplexity'], // Not registered
      };

      expect(() => createPersonaAgents(registry, options)).toThrow('Provider "perplexity" is not registered');
    });
  });
});
