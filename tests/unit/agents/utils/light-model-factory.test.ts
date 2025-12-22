/**
 * Light Model Factory Tests
 *
 * Tests for the utility that creates lightweight model variants
 * of agents for cost-efficient analysis tasks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLightModelAgent } from '../../../../src/agents/utils/light-model-factory.js';
import { AgentRegistry } from '../../../../src/agents/registry.js';
import { LIGHT_MODELS } from '../../../../src/agents/setup.js';
import type { BaseAgent } from '../../../../src/agents/base.js';
import type { AgentConfig, AIProvider } from '../../../../src/types/index.js';

/**
 * Create a mock agent that implements BaseAgent interface
 */
function createMockAgent(id: string, name: string, provider: AIProvider, model: string): BaseAgent {
  return {
    id,
    name,
    provider,
    model,
    getInfo: () => ({ id, name, provider, model }),
    setToolkit: vi.fn(),
    generateResponse: vi.fn(),
    healthCheck: vi.fn(),
    generateRawCompletion: vi.fn(),
    synthesize: vi.fn(),
  } as unknown as BaseAgent;
}

describe('Light Model Factory', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe('createLightModelAgent', () => {
    it('should create light model agent with correct config for anthropic', () => {
      const createdAgent = createMockAgent(
        'claude-light-test',
        'Claude (Light)',
        'anthropic',
        LIGHT_MODELS.anthropic
      );

      const mockFactory = vi.fn().mockReturnValue(createdAgent);
      registry.registerProvider('anthropic', mockFactory, 'claude-sonnet-4-5');

      const baseAgent = createMockAgent('claude-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');

      const lightAgent = createLightModelAgent(baseAgent, registry, {
        idSuffix: 'test',
      });

      expect(mockFactory).toHaveBeenCalledWith({
        id: 'claude-1-light-test',
        name: 'Claude (Light)',
        provider: 'anthropic',
        model: LIGHT_MODELS.anthropic,
      });
      expect(lightAgent).toBe(createdAgent);
    });

    it('should create light model agent with correct config for openai', () => {
      const createdAgent = createMockAgent(
        'chatgpt-light-consensus',
        'ChatGPT (Light)',
        'openai',
        LIGHT_MODELS.openai
      );

      const mockFactory = vi.fn().mockReturnValue(createdAgent);
      registry.registerProvider('openai', mockFactory, 'gpt-5.2');

      const baseAgent = createMockAgent('chatgpt-1', 'ChatGPT', 'openai', 'gpt-5.2');

      const lightAgent = createLightModelAgent(baseAgent, registry, {
        idSuffix: 'consensus',
      });

      expect(mockFactory).toHaveBeenCalledWith({
        id: 'chatgpt-1-light-consensus',
        name: 'ChatGPT (Light)',
        provider: 'openai',
        model: LIGHT_MODELS.openai,
      });
      expect(lightAgent).toBe(createdAgent);
    });

    it('should create light model agent with correct config for google', () => {
      const createdAgent = createMockAgent(
        'gemini-light-keypoints',
        'Gemini (Light)',
        'google',
        LIGHT_MODELS.google
      );

      const mockFactory = vi.fn().mockReturnValue(createdAgent);
      registry.registerProvider('google', mockFactory, 'gemini-3-flash-preview');

      const baseAgent = createMockAgent('gemini-1', 'Gemini', 'google', 'gemini-3-flash-preview');

      const lightAgent = createLightModelAgent(baseAgent, registry, {
        idSuffix: 'keypoints',
      });

      expect(mockFactory).toHaveBeenCalledWith({
        id: 'gemini-1-light-keypoints',
        name: 'Gemini (Light)',
        provider: 'google',
        model: LIGHT_MODELS.google,
      });
      expect(lightAgent).toBe(createdAgent);
    });

    it('should create light model agent with correct config for perplexity', () => {
      const createdAgent = createMockAgent(
        'perplexity-light-analysis',
        'Perplexity (Light)',
        'perplexity',
        LIGHT_MODELS.perplexity
      );

      const mockFactory = vi.fn().mockReturnValue(createdAgent);
      registry.registerProvider('perplexity', mockFactory, 'sonar-pro');

      const baseAgent = createMockAgent('perplexity-1', 'Perplexity', 'perplexity', 'sonar-pro');

      const lightAgent = createLightModelAgent(baseAgent, registry, {
        idSuffix: 'analysis',
      });

      expect(mockFactory).toHaveBeenCalledWith({
        id: 'perplexity-1-light-analysis',
        name: 'Perplexity (Light)',
        provider: 'perplexity',
        model: LIGHT_MODELS.perplexity,
      });
      expect(lightAgent).toBe(createdAgent);
    });

    it('should include maxTokens when provided', () => {
      const createdAgent = createMockAgent(
        'claude-light-test',
        'Claude (Light)',
        'anthropic',
        LIGHT_MODELS.anthropic
      );

      const mockFactory = vi.fn().mockReturnValue(createdAgent);
      registry.registerProvider('anthropic', mockFactory, 'claude-sonnet-4-5');

      const baseAgent = createMockAgent('claude-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');

      createLightModelAgent(baseAgent, registry, {
        idSuffix: 'test',
        maxTokens: 8192,
      });

      expect(mockFactory).toHaveBeenCalledWith({
        id: 'claude-1-light-test',
        name: 'Claude (Light)',
        provider: 'anthropic',
        model: LIGHT_MODELS.anthropic,
        maxTokens: 8192,
      });
    });

    it('should not include maxTokens when not provided', () => {
      const createdAgent = createMockAgent(
        'claude-light-test',
        'Claude (Light)',
        'anthropic',
        LIGHT_MODELS.anthropic
      );

      const mockFactory = vi.fn().mockReturnValue(createdAgent);
      registry.registerProvider('anthropic', mockFactory, 'claude-sonnet-4-5');

      const baseAgent = createMockAgent('claude-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');

      createLightModelAgent(baseAgent, registry, {
        idSuffix: 'test',
      });

      const callArgs = mockFactory.mock.calls[0][0] as AgentConfig;
      expect(callArgs).not.toHaveProperty('maxTokens');
    });

    it('should fallback to base agent when factory not available', () => {
      // Registry has no providers registered
      const baseAgent = createMockAgent('claude-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');

      const lightAgent = createLightModelAgent(baseAgent, registry, {
        idSuffix: 'test',
      });

      // Should return the same base agent as fallback
      expect(lightAgent).toBe(baseAgent);
    });

    it('should use correct light model for each provider', () => {
      // Verify LIGHT_MODELS mapping
      expect(LIGHT_MODELS.anthropic).toBe('claude-haiku-4-5');
      expect(LIGHT_MODELS.openai).toBe('gpt-5-mini');
      expect(LIGHT_MODELS.google).toBe('gemini-2.5-flash-lite');
      expect(LIGHT_MODELS.perplexity).toBe('sonar');
    });

    it('should generate unique IDs with different suffixes', () => {
      const createdAgent1 = createMockAgent(
        'claude-1-light-consensus',
        'Claude (Light)',
        'anthropic',
        LIGHT_MODELS.anthropic
      );
      const createdAgent2 = createMockAgent(
        'claude-1-light-keypoints',
        'Claude (Light)',
        'anthropic',
        LIGHT_MODELS.anthropic
      );

      const mockFactory = vi
        .fn()
        .mockReturnValueOnce(createdAgent1)
        .mockReturnValueOnce(createdAgent2);

      registry.registerProvider('anthropic', mockFactory, 'claude-sonnet-4-5');

      const baseAgent = createMockAgent('claude-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');

      createLightModelAgent(baseAgent, registry, { idSuffix: 'consensus' });
      createLightModelAgent(baseAgent, registry, { idSuffix: 'keypoints' });

      expect(mockFactory).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'claude-1-light-consensus' })
      );
      expect(mockFactory).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'claude-1-light-keypoints' })
      );
    });

    it('should preserve base agent name in light agent name', () => {
      const createdAgent = createMockAgent(
        'custom-agent-light-test',
        'Custom Agent Name (Light)',
        'anthropic',
        LIGHT_MODELS.anthropic
      );

      const mockFactory = vi.fn().mockReturnValue(createdAgent);
      registry.registerProvider('anthropic', mockFactory, 'claude-sonnet-4-5');

      const baseAgent = createMockAgent(
        'custom-agent',
        'Custom Agent Name',
        'anthropic',
        'claude-sonnet-4-5'
      );

      createLightModelAgent(baseAgent, registry, { idSuffix: 'test' });

      expect(mockFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Agent Name (Light)',
        })
      );
    });
  });

  describe('LIGHT_MODELS constant', () => {
    it('should have light models defined for all providers', () => {
      const providers: AIProvider[] = ['anthropic', 'openai', 'google', 'perplexity'];

      for (const provider of providers) {
        expect(LIGHT_MODELS[provider]).toBeDefined();
        expect(typeof LIGHT_MODELS[provider]).toBe('string');
        expect(LIGHT_MODELS[provider].length).toBeGreaterThan(0);
      }
    });

    it('should have different models than heavy models', () => {
      // These are the default heavy models from setup.ts
      const heavyModels = {
        anthropic: 'claude-sonnet-4-5',
        openai: 'gpt-5.2',
        google: 'gemini-3-flash-preview',
        perplexity: 'sonar-pro',
      };

      expect(LIGHT_MODELS.anthropic).not.toBe(heavyModels.anthropic);
      expect(LIGHT_MODELS.openai).not.toBe(heavyModels.openai);
      expect(LIGHT_MODELS.google).not.toBe(heavyModels.google);
      expect(LIGHT_MODELS.perplexity).not.toBe(heavyModels.perplexity);
    });
  });
});
