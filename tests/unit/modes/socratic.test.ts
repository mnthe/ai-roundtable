import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocraticMode } from '../../../src/modes/socratic.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext, AgentResponse } from '../../../src/types/index.js';

describe('SocraticMode', () => {
  let mode: SocraticMode;
  let mockToolkit: AgentToolkit;

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'What is justice?',
    mode: 'socratic',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  beforeEach(() => {
    mode = new SocraticMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
      setContext: vi.fn(),
      getPendingContextRequests: () => [],
      clearPendingRequests: vi.fn(),
      hasPendingRequests: () => false,
    };
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(mode.name).toBe('socratic');
    });
  });

  describe('executeRound', () => {
    it('should return empty array for no agents', async () => {
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should execute agents sequentially for dialogic questioning', async () => {
      const executionOrder: string[] = [];

      const agent1 = new MockAgent({
        id: 'agent-1',
        name: 'Socrates',
        provider: 'anthropic',
        model: 'mock',
      });
      const agent2 = new MockAgent({
        id: 'agent-2',
        name: 'Plato',
        provider: 'openai',
        model: 'mock',
      });

      vi.spyOn(agent1, 'generateResponse').mockImplementation(async () => {
        executionOrder.push('agent-1');
        return {
          agentId: 'agent-1',
          agentName: 'Socrates',
          position: 'What do you mean by justice?',
          reasoning: 'We must first define our terms',
          confidence: 0.6,
          timestamp: new Date(),
        };
      });

      vi.spyOn(agent2, 'generateResponse').mockImplementation(async () => {
        executionOrder.push('agent-2');
        return {
          agentId: 'agent-2',
          agentName: 'Plato',
          position: 'Justice is giving each their due',
          reasoning: 'But what is due to each?',
          confidence: 0.7,
          timestamp: new Date(),
        };
      });

      const responses = await mode.executeRound([agent1, agent2], defaultContext, mockToolkit);

      expect(responses).toHaveLength(2);
      expect(executionOrder).toEqual(['agent-1', 'agent-2']); // Sequential
    });

    it('should include current round responses for ongoing dialogue', async () => {
      let secondAgentContext: DebateContext | null = null;

      const agent1 = new MockAgent({
        id: 'agent-1',
        name: 'Socrates',
        provider: 'anthropic',
        model: 'mock',
      });
      const agent2 = new MockAgent({
        id: 'agent-2',
        name: 'Plato',
        provider: 'openai',
        model: 'mock',
      });

      vi.spyOn(agent1, 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Socrates',
        position: 'First question',
        reasoning: 'Initial inquiry',
        confidence: 0.6,
        timestamp: new Date(),
      });

      vi.spyOn(agent2, 'generateResponse').mockImplementation(async (ctx) => {
        secondAgentContext = ctx;
        return {
          agentId: 'agent-2',
          agentName: 'Plato',
          position: 'Response and follow-up question',
          reasoning: 'Continued inquiry',
          confidence: 0.7,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent1, agent2], defaultContext, mockToolkit);

      expect(secondAgentContext?.previousResponses).toHaveLength(1);
      expect(secondAgentContext?.previousResponses[0]?.agentName).toBe('Socrates');
    });
  });

  describe('buildAgentPrompt', () => {
    it('should include Socratic dialogue instructions', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt).toContain('Socratic Dialogue');
      expect(prompt).toContain('probing questions');
      expect(prompt).toContain('assumptions');
    });

    it('should include focus question when provided', () => {
      const contextWithFocus: DebateContext = {
        ...defaultContext,
        focusQuestion: 'How do we know what is good?',
      };

      const prompt = mode.buildAgentPrompt(contextWithFocus);

      expect(prompt).toContain('How do we know what is good?');
      // Updated to match 4-Layer Framework
      expect(prompt).toContain('FOCUS QUESTION');
    });

    it('should encourage questioning when previous responses exist', () => {
      const contextWithPrevious: DebateContext = {
        ...defaultContext,
        previousResponses: [
          {
            agentId: 'other',
            agentName: 'Other Agent',
            position: 'Justice is fairness',
            reasoning: 'Based on social contract',
            confidence: 0.7,
            timestamp: new Date(),
          },
        ],
      };

      const prompt = mode.buildAgentPrompt(contextWithPrevious);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('EXAMINING ASSUMPTIONS');
      expect(prompt).toContain('QUESTIONING THE POSITION');
    });

    it('should include foundational guidance for first round', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('FRAMING QUESTION');
      expect(prompt).toContain('FOUNDATIONAL QUESTIONS');
    });
  });
});
