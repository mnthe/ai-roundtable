import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AgentRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
} from '../../../src/agents/registry.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentConfig } from '../../../src/types/index.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
    // Register mock provider
    registry.registerProvider(
      'anthropic',
      (config) => new MockAgent(config),
      'claude-3-opus'
    );
    registry.registerProvider(
      'openai',
      (config) => new MockAgent(config),
      'gpt-4'
    );
  });

  describe('registerProvider', () => {
    it('should register a new provider', () => {
      const newRegistry = new AgentRegistry();
      expect(newRegistry.hasProvider('anthropic')).toBe(false);

      newRegistry.registerProvider(
        'anthropic',
        (config) => new MockAgent(config),
        'claude-3'
      );

      expect(newRegistry.hasProvider('anthropic')).toBe(true);
    });

    it('should overwrite existing provider', () => {
      registry.registerProvider(
        'anthropic',
        (config) => new MockAgent(config),
        'claude-3-5-sonnet'
      );

      expect(registry.getDefaultModel('anthropic')).toBe('claude-3-5-sonnet');
    });
  });

  describe('getRegisteredProviders', () => {
    it('should return all registered providers', () => {
      const providers = registry.getRegisteredProviders();

      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toHaveLength(2);
    });
  });

  describe('createAgent', () => {
    it('should create an agent', () => {
      const config: AgentConfig = {
        id: 'claude-1',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
      };

      const agent = registry.createAgent(config);

      expect(agent.id).toBe('claude-1');
      expect(agent.name).toBe('Claude');
      expect(agent.provider).toBe('anthropic');
    });

    it('should throw for unregistered provider', () => {
      const config: AgentConfig = {
        id: 'test',
        name: 'Test',
        provider: 'google', // Not registered
        model: 'gemini',
      };

      expect(() => registry.createAgent(config)).toThrow('Provider "google" is not registered');
    });

    it('should throw for duplicate agent ID', () => {
      const config: AgentConfig = {
        id: 'duplicate',
        name: 'Agent',
        provider: 'anthropic',
        model: 'claude',
      };

      registry.createAgent(config);

      expect(() => registry.createAgent(config)).toThrow('Agent with ID "duplicate" already exists');
    });

    it('should store created agent', () => {
      const config: AgentConfig = {
        id: 'stored-agent',
        name: 'Stored',
        provider: 'openai',
        model: 'gpt-4',
      };

      registry.createAgent(config);

      expect(registry.hasAgent('stored-agent')).toBe(true);
    });
  });

  describe('getAgent', () => {
    it('should return existing agent', () => {
      registry.createAgent({
        id: 'test-agent',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
      });

      const agent = registry.getAgent('test-agent');
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('test-agent');
    });

    it('should return undefined for non-existent agent', () => {
      const agent = registry.getAgent('non-existent');
      expect(agent).toBeUndefined();
    });
  });

  describe('getAgentOrThrow', () => {
    it('should return existing agent', () => {
      registry.createAgent({
        id: 'test-agent',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
      });

      const agent = registry.getAgentOrThrow('test-agent');
      expect(agent.id).toBe('test-agent');
    });

    it('should throw for non-existent agent', () => {
      expect(() => registry.getAgentOrThrow('non-existent')).toThrow(
        'Agent "non-existent" not found'
      );
    });
  });

  describe('getAgents', () => {
    it('should return multiple agents', () => {
      registry.createAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'claude',
      });
      registry.createAgent({
        id: 'agent-2',
        name: 'Agent 2',
        provider: 'openai',
        model: 'gpt-4',
      });

      const agents = registry.getAgents(['agent-1', 'agent-2']);

      expect(agents).toHaveLength(2);
      expect(agents[0]?.id).toBe('agent-1');
      expect(agents[1]?.id).toBe('agent-2');
    });

    it('should throw if any agent is missing', () => {
      registry.createAgent({
        id: 'existing',
        name: 'Existing',
        provider: 'anthropic',
        model: 'claude',
      });

      expect(() => registry.getAgents(['existing', 'missing'])).toThrow(
        'Agent "missing" not found'
      );
    });
  });

  describe('removeAgent', () => {
    it('should remove existing agent', () => {
      registry.createAgent({
        id: 'to-remove',
        name: 'Remove Me',
        provider: 'anthropic',
        model: 'claude',
      });

      expect(registry.hasAgent('to-remove')).toBe(true);

      const result = registry.removeAgent('to-remove');

      expect(result).toBe(true);
      expect(registry.hasAgent('to-remove')).toBe(false);
    });

    it('should return false for non-existent agent', () => {
      const result = registry.removeAgent('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getAllAgentIds', () => {
    it('should return all agent IDs', () => {
      registry.createAgent({
        id: 'agent-a',
        name: 'A',
        provider: 'anthropic',
        model: 'claude',
      });
      registry.createAgent({
        id: 'agent-b',
        name: 'B',
        provider: 'openai',
        model: 'gpt-4',
      });

      const ids = registry.getAllAgentIds();

      expect(ids).toContain('agent-a');
      expect(ids).toContain('agent-b');
      expect(ids).toHaveLength(2);
    });
  });

  describe('getAgentInfoList', () => {
    it('should return info for all agents', () => {
      registry.createAgent({
        id: 'claude-1',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-3-opus',
      });
      registry.createAgent({
        id: 'gpt-1',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4-turbo',
      });

      const infoList = registry.getAgentInfoList();

      expect(infoList).toHaveLength(2);
      expect(infoList).toContainEqual({
        id: 'claude-1',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-3-opus',
      });
      expect(infoList).toContainEqual({
        id: 'gpt-1',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4-turbo',
      });
    });
  });

  describe('clear methods', () => {
    beforeEach(() => {
      registry.createAgent({
        id: 'agent-1',
        name: 'Agent',
        provider: 'anthropic',
        model: 'claude',
      });
    });

    it('should clear agents', () => {
      expect(registry.getAllAgentIds()).toHaveLength(1);

      registry.clearAgents();

      expect(registry.getAllAgentIds()).toHaveLength(0);
      expect(registry.hasProvider('anthropic')).toBe(true); // Providers not cleared
    });

    it('should clear providers', () => {
      registry.clearProviders();

      expect(registry.getRegisteredProviders()).toHaveLength(0);
      expect(registry.hasAgent('agent-1')).toBe(true); // Agents not cleared
    });

    it('should clear everything', () => {
      registry.clear();

      expect(registry.getAllAgentIds()).toHaveLength(0);
      expect(registry.getRegisteredProviders()).toHaveLength(0);
    });
  });

  describe('toolkit integration', () => {
    it('should set toolkit on all agents', () => {
      const mockToolkit = {
        getTools: () => [],
        executeTool: async () => ({}),
      };

      registry.createAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'claude',
      });

      // Should not throw
      registry.setToolkit(mockToolkit);

      // New agents should also get toolkit
      const agent2 = registry.createAgent({
        id: 'agent-2',
        name: 'Agent 2',
        provider: 'openai',
        model: 'gpt-4',
      });

      expect(agent2).toBeDefined();
    });
  });
});

describe('Global Registry', () => {
  afterEach(() => {
    resetGlobalRegistry();
  });

  it('should return singleton instance', () => {
    const registry1 = getGlobalRegistry();
    const registry2 = getGlobalRegistry();

    expect(registry1).toBe(registry2);
  });

  it('should reset properly', () => {
    const registry1 = getGlobalRegistry();
    registry1.registerProvider(
      'anthropic',
      (config) => new MockAgent(config),
      'claude'
    );

    resetGlobalRegistry();

    const registry2 = getGlobalRegistry();
    expect(registry2).not.toBe(registry1);
    expect(registry2.hasProvider('anthropic')).toBe(false);
  });
});
