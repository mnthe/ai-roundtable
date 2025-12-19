import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DevilsAdvocateMode } from '../../../src/modes/devils-advocate.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext } from '../../../src/types/index.js';

describe('DevilsAdvocateMode', () => {
  let mode: DevilsAdvocateMode;
  let mockToolkit: AgentToolkit;

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Should remote work be mandatory?',
    mode: 'devils-advocate',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  beforeEach(() => {
    mode = new DevilsAdvocateMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
      setContext: vi.fn(),
    };
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(mode.name).toBe('devils-advocate');
    });
  });

  describe('executeRound', () => {
    it('should return empty array for no agents', async () => {
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should handle single agent', async () => {
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Pro remote work',
        reasoning: 'Increases productivity',
        confidence: 0.8,
        timestamp: new Date(),
      });

      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);
      expect(responses).toHaveLength(1);
    });

    it('should execute multiple agents sequentially', async () => {
      const executionOrder: string[] = [];
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Proposer', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Advocate', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'agent-3', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          executionOrder.push(agent.id);
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: `Position from ${agent.name}`,
            reasoning: `Reasoning from ${agent.name}`,
            confidence: 0.75,
            timestamp: new Date(),
          };
        });
      }

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);
      expect(responses).toHaveLength(3);
      expect(executionOrder).toEqual(['agent-1', 'agent-2', 'agent-3']); // Sequential
    });

    it('should include current round responses in context for later agents', async () => {
      let secondAgentContext: DebateContext | null = null;

      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Proposer', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Advocate', provider: 'openai', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Proposer',
        position: 'First position',
        reasoning: 'First reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      });

      vi.spyOn(agents[1], 'generateResponse').mockImplementation(async (ctx) => {
        secondAgentContext = ctx;
        return {
          agentId: 'agent-2',
          agentName: 'Advocate',
          position: 'Counter position',
          reasoning: 'Counter reasoning',
          confidence: 0.7,
          timestamp: new Date(),
        };
      });

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Second agent should see first agent's response
      expect(secondAgentContext?.previousResponses).toHaveLength(1);
      expect(secondAgentContext?.previousResponses[0]?.position).toBe('First position');
    });

    it('should set toolkit on each agent', async () => {
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'mock',
      });

      const setToolkitSpy = vi.spyOn(agent, 'setToolkit');
      vi.spyOn(agent, 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Position',
        reasoning: 'Reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);
      expect(setToolkitSpy).toHaveBeenCalledWith(mockToolkit);
    });
  });

  describe('buildAgentPrompt', () => {
    it('should include mode-specific instructions', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);
      expect(prompt.toLowerCase()).toContain("devil's advocate");
    });

    it('should include focus question when provided', () => {
      const contextWithFocus: DebateContext = {
        ...defaultContext,
        focusQuestion: 'What about work-life balance?',
      };

      const prompt = mode.buildAgentPrompt(contextWithFocus);
      expect(prompt).toContain('What about work-life balance?');
    });

    it('should provide different prompts for different roles', () => {
      // First agent (no previous responses)
      const firstPrompt = mode.buildAgentPrompt(defaultContext);
      expect(firstPrompt).toContain('Primary Position');

      // Second agent (one previous response)
      const contextWithOneResponse: DebateContext = {
        ...defaultContext,
        previousResponses: [
          {
            agentId: 'agent-1',
            agentName: 'First Agent',
            position: 'Some position',
            reasoning: 'Some reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          },
        ],
      };
      const secondPrompt = mode.buildAgentPrompt(contextWithOneResponse);
      expect(secondPrompt).toContain('Opposition');

      // Third agent (two previous responses)
      const contextWithTwoResponses: DebateContext = {
        ...defaultContext,
        previousResponses: [
          {
            agentId: 'agent-1',
            agentName: 'First Agent',
            position: 'Some position',
            reasoning: 'Some reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          },
          {
            agentId: 'agent-2',
            agentName: 'Second Agent',
            position: 'Counter position',
            reasoning: 'Counter reasoning',
            confidence: 0.7,
            timestamp: new Date(),
          },
        ],
      };
      const thirdPrompt = mode.buildAgentPrompt(contextWithTwoResponses);
      expect(thirdPrompt).toContain('Evaluator');
    });
  });

  describe('role assignment', () => {
    it('should give first agent the proposer role', async () => {
      let receivedContext: DebateContext | null = null;
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'First',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx) => {
        receivedContext = { ...ctx };
        return {
          agentId: agent.id,
          agentName: agent.name,
          position: 'Position',
          reasoning: 'Reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // First agent should not have previous responses
      expect(receivedContext?.previousResponses).toHaveLength(0);
    });

    it('should give second agent access to first agent response', async () => {
      let secondAgentContext: DebateContext | null = null;
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'First', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Second', provider: 'openai', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'First',
        position: 'Pro position',
        reasoning: 'Pro reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      });

      vi.spyOn(agents[1], 'generateResponse').mockImplementation(async (ctx) => {
        secondAgentContext = { ...ctx };
        return {
          agentId: 'agent-2',
          agentName: 'Second',
          position: 'Counter position',
          reasoning: 'Counter reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Second agent should see first agent's response
      expect(secondAgentContext?.previousResponses).toHaveLength(1);
    });
  });
});
