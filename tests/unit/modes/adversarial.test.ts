import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdversarialMode } from '../../../src/modes/adversarial.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext, AgentResponse } from '../../../src/types/index.js';

describe('AdversarialMode', () => {
  let mode: AdversarialMode;
  let mockToolkit: AgentToolkit;

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Should AI be regulated?',
    mode: 'adversarial',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  beforeEach(() => {
    mode = new AdversarialMode();
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
      expect(mode.name).toBe('adversarial');
    });
  });

  describe('executeRound', () => {
    it('should set modePrompt in context passed to agents', async () => {
      let capturedContext: DebateContext | undefined;

      // Create a test agent that captures the context it receives
      class TestAgent extends MockAgent {
        async generateResponse(context: DebateContext): Promise<AgentResponse> {
          capturedContext = context;
          return super.generateResponse(context);
        }
      }

      const agent = new TestAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'test-model',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(capturedContext).toBeDefined();
      expect(capturedContext!.modePrompt).toBeDefined();
      expect(capturedContext!.modePrompt).toContain('Adversarial');
      expect(capturedContext!.modePrompt).toContain('counter-arguments');
    });

    it('should return empty array for no agents', async () => {
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should execute agents sequentially', async () => {
      const executionOrder: string[] = [];

      const agent1 = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'mock',
      });
      const agent2 = new MockAgent({
        id: 'agent-2',
        name: 'Agent 2',
        provider: 'openai',
        model: 'mock',
      });

      // Track execution order
      vi.spyOn(agent1, 'generateResponse').mockImplementation(async () => {
        executionOrder.push('agent-1');
        return {
          agentId: 'agent-1',
          agentName: 'Agent 1',
          position: 'Position 1',
          reasoning: 'Reasoning 1',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      vi.spyOn(agent2, 'generateResponse').mockImplementation(async () => {
        executionOrder.push('agent-2');
        return {
          agentId: 'agent-2',
          agentName: 'Agent 2',
          position: 'Position 2',
          reasoning: 'Reasoning 2',
          confidence: 0.7,
          timestamp: new Date(),
        };
      });

      const responses = await mode.executeRound([agent1, agent2], defaultContext, mockToolkit);

      expect(responses).toHaveLength(2);
      expect(executionOrder).toEqual(['agent-1', 'agent-2']); // Sequential
    });

    it('should include current round responses in context for later agents', async () => {
      let secondAgentContext: DebateContext | null = null;

      const agent1 = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'mock',
      });
      const agent2 = new MockAgent({
        id: 'agent-2',
        name: 'Agent 2',
        provider: 'openai',
        model: 'mock',
      });

      vi.spyOn(agent1, 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'First position',
        reasoning: 'First reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      });

      vi.spyOn(agent2, 'generateResponse').mockImplementation(async (ctx) => {
        secondAgentContext = ctx;
        return {
          agentId: 'agent-2',
          agentName: 'Agent 2',
          position: 'Counter position',
          reasoning: 'Counter reasoning',
          confidence: 0.7,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent1, agent2], defaultContext, mockToolkit);

      // Second agent should see first agent's response from current round
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

      await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(setToolkitSpy).toHaveBeenCalledWith(mockToolkit);
    });
  });

  describe('buildAgentPrompt', () => {
    it('should include adversarial mode instructions', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt).toContain('Adversarial Debate');
      expect(prompt).toContain('Challenging');
      expect(prompt).toContain('counter-arguments');
    });

    it('should include focus question when provided', () => {
      const contextWithFocus: DebateContext = {
        ...defaultContext,
        focusQuestion: 'What about privacy concerns?',
      };

      const prompt = mode.buildAgentPrompt(contextWithFocus);

      expect(prompt).toContain('What about privacy concerns?');
    });

    it('should include critique guidance when previous responses exist', () => {
      const contextWithPrevious: DebateContext = {
        ...defaultContext,
        previousResponses: [
          {
            agentId: 'other',
            agentName: 'Other Agent',
            position: 'Test position',
            reasoning: 'Test reasoning',
            confidence: 0.7,
            timestamp: new Date(),
          },
        ],
      };

      const prompt = mode.buildAgentPrompt(contextWithPrevious);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('STEEL-MAN SUMMARY');
      expect(prompt).toContain('COUNTER-ARGUMENTS');
    });

    it('should include establishment guidance for first round', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('STRONG POSITION');
      expect(prompt).toContain('ANTICIPATED ATTACKS');
    });
  });
});
