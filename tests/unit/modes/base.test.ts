import { describe, it, expect } from 'vitest';
import type { DebateModeStrategy } from '../../../src/modes/base.js';
import type { DebateContext, AgentResponse } from '../../../src/types/index.js';
import { MockAgent } from '../../../src/agents/base.js';

describe('DebateModeStrategy interface', () => {
  it('should be implemented by mode strategies', () => {
    // Create a minimal implementation to verify the interface structure
    const mockStrategy: DebateModeStrategy = {
      name: 'test-mode',
      async executeRound(agents, context, toolkit) {
        return [];
      },
      buildAgentPrompt(context) {
        return 'test prompt';
      },
    };

    expect(mockStrategy.name).toBe('test-mode');
    expect(typeof mockStrategy.executeRound).toBe('function');
    expect(typeof mockStrategy.buildAgentPrompt).toBe('function');
  });

  it('should allow custom mode implementations', async () => {
    const customMode: DebateModeStrategy = {
      name: 'custom',
      async executeRound(agents, context, toolkit) {
        const responses: AgentResponse[] = [];
        for (const agent of agents) {
          const response = await agent.generateResponse(context);
          responses.push(response);
        }
        return responses;
      },
      buildAgentPrompt(context) {
        return `Custom prompt for ${context.topic}`;
      },
    };

    const context: DebateContext = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      mode: 'collaborative',
      currentRound: 1,
      totalRounds: 3,
      previousResponses: [],
    };

    const mockToolkit = {
      getTools: () => [],
      executeTool: async () => ({}),
      setContext: () => {},
    };

    const agent = new MockAgent({
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'anthropic',
      model: 'test-model',
    });

    const responses = await customMode.executeRound([agent], context, mockToolkit);

    expect(responses).toHaveLength(1);
    expect(responses[0].agentId).toBe('test-agent');

    const prompt = customMode.buildAgentPrompt(context);
    expect(prompt).toContain('Test Topic');
  });

  it('should support empty agent arrays', async () => {
    const mockStrategy: DebateModeStrategy = {
      name: 'test-mode',
      async executeRound(agents, context, toolkit) {
        return [];
      },
      buildAgentPrompt(context) {
        return 'test prompt';
      },
    };

    const context: DebateContext = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      mode: 'collaborative',
      currentRound: 1,
      totalRounds: 3,
      previousResponses: [],
    };

    const mockToolkit = {
      getTools: () => [],
      executeTool: async () => ({}),
      setContext: () => {},
    };

    const responses = await mockStrategy.executeRound([], context, mockToolkit);
    expect(responses).toEqual([]);
  });
});
