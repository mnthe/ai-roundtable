import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelphiMode } from '../../../src/modes/delphi.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext } from '../../../src/types/index.js';

describe('DelphiMode', () => {
  let mode: DelphiMode;
  let mockToolkit: AgentToolkit;

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'What will be the impact of AI on employment by 2030?',
    mode: 'delphi',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  beforeEach(() => {
    mode = new DelphiMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
      setContext: vi.fn(),
    };
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(mode.name).toBe('delphi');
    });
  });

  describe('executeRound', () => {
    it('should return empty array for no agents', async () => {
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should execute all agents in parallel', async () => {
      const startTimes: number[] = [];
      const agents = [
        new MockAgent({ id: 'expert-1', name: 'Expert 1', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'expert-2', name: 'Expert 2', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'expert-3', name: 'Expert 3', provider: 'google', model: 'mock' }),
      ];

      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          startTimes.push(Date.now());
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: `Prediction from ${agent.name}`,
            reasoning: `Analysis from ${agent.name}`,
            confidence: 0.75,
            timestamp: new Date(),
          };
        });
      }

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);
      expect(responses).toHaveLength(3);

      // All agents should start at approximately the same time (parallel)
      const maxTimeDiff = Math.max(...startTimes) - Math.min(...startTimes);
      expect(maxTimeDiff).toBeLessThan(50); // Within 50ms of each other
    });

    it('should anonymize previous responses', async () => {
      const contextWithPrevious: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses: [
          {
            agentId: 'expert-1',
            agentName: 'Expert 1',
            position: '30% job displacement',
            reasoning: 'Based on automation trends',
            confidence: 0.8,
            timestamp: new Date(),
          },
          {
            agentId: 'expert-2',
            agentName: 'Expert 2',
            position: '50% job transformation',
            reasoning: 'Based on historical patterns',
            confidence: 0.7,
            timestamp: new Date(),
          },
        ],
      };

      let receivedContext: DebateContext | null = null;
      const agent = new MockAgent({
        id: 'expert-1',
        name: 'Expert 1',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx) => {
        receivedContext = ctx;
        return {
          agentId: 'expert-1',
          agentName: 'Expert 1',
          position: 'Revised prediction',
          reasoning: 'Updated analysis',
          confidence: 0.85,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], contextWithPrevious, mockToolkit);

      // Agent should receive anonymized context
      expect(receivedContext).not.toBeNull();
      // Check that responses are anonymized (agentName should be "Participant N")
      for (const response of receivedContext!.previousResponses) {
        expect(response.agentName).toMatch(/Participant \d+/);
      }
    });

    it('should set toolkit on each agent', async () => {
      const agent = new MockAgent({
        id: 'expert-1',
        name: 'Expert 1',
        provider: 'anthropic',
        model: 'mock',
      });

      const setToolkitSpy = vi.spyOn(agent, 'setToolkit');
      vi.spyOn(agent, 'generateResponse').mockResolvedValue({
        agentId: 'expert-1',
        agentName: 'Expert 1',
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
    it('should include Delphi method instructions', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt.toLowerCase()).toContain('delphi');
      expect(prompt.toLowerCase()).toContain('anonymous');
    });

    it('should include focus question when provided', () => {
      const contextWithFocus: DebateContext = {
        ...defaultContext,
        focusQuestion: 'Focus on the tech sector specifically',
      };

      const prompt = mode.buildAgentPrompt(contextWithFocus);
      expect(prompt).toContain('Focus on the tech sector');
    });

    it('should include statistics when previous responses exist', () => {
      const contextWithPrevious: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses: [
          {
            agentId: 'expert-1',
            agentName: 'Expert 1',
            position: 'High impact prediction',
            reasoning: 'Detailed analysis',
            confidence: 0.8,
            timestamp: new Date(),
          },
          {
            agentId: 'expert-2',
            agentName: 'Expert 2',
            position: 'Medium impact prediction',
            reasoning: 'Alternative analysis',
            confidence: 0.6,
            timestamp: new Date(),
          },
        ],
      };

      const prompt = mode.buildAgentPrompt(contextWithPrevious);

      // Should include statistical information
      expect(prompt.toLowerCase()).toMatch(/confidence|statistic|participant/);
    });

    it('should encourage independent assessment in first round', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt.toLowerCase()).toMatch(/independent|honest|assessment/);
    });
  });

  describe('consensus tracking', () => {
    it('should work with varying confidence levels', async () => {
      const agents = [
        new MockAgent({ id: 'e1', name: 'Expert 1', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'e2', name: 'Expert 2', provider: 'openai', model: 'mock' }),
      ];

      const confidences = [0.6, 0.9];
      agents.forEach((agent, i) => {
        vi.spyOn(agent, 'generateResponse').mockResolvedValue({
          agentId: agent.id,
          agentName: agent.name,
          position: 'Prediction',
          reasoning: 'Analysis',
          confidence: confidences[i],
          timestamp: new Date(),
        });
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(2);
      expect(responses[0].confidence).toBe(0.6);
      expect(responses[1].confidence).toBe(0.9);
    });

    it('should handle multiple rounds of iteration', async () => {
      // Simulate a second round with previous responses
      const contextRound2: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses: [
          {
            agentId: 'e1',
            agentName: 'Expert 1',
            position: 'Initial prediction',
            reasoning: 'Initial analysis',
            confidence: 0.6,
            timestamp: new Date(),
          },
        ],
      };

      const agent = new MockAgent({
        id: 'e1',
        name: 'Expert 1',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockResolvedValue({
        agentId: 'e1',
        agentName: 'Expert 1',
        position: 'Revised prediction',
        reasoning: 'Revised analysis',
        confidence: 0.75, // Higher confidence after considering feedback
        timestamp: new Date(),
      });

      const responses = await mode.executeRound([agent], contextRound2, mockToolkit);

      expect(responses).toHaveLength(1);
      expect(responses[0].confidence).toBe(0.75);
    });
  });
});
