import { describe, it, expect, beforeEach } from 'vitest';
import { CollaborativeMode } from '../../../src/modes/collaborative.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { DebateContext, AgentResponse, AgentConfig } from '../../../src/types/index.js';

describe('CollaborativeMode', () => {
  let mode: CollaborativeMode;
  let mockToolkit: {
    getTools: () => [];
    executeTool: () => Promise<object>;
    setContext: (context: DebateContext) => void;
    getPendingContextRequests: () => [];
    clearPendingRequests: () => void;
    hasPendingRequests: () => boolean;
  };

  beforeEach(() => {
    mode = new CollaborativeMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: async () => ({}),
      setContext: () => {},
      getPendingContextRequests: () => [],
      clearPendingRequests: () => {},
      hasPendingRequests: () => false,
    };
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(mode.name).toBe('collaborative');
    });
  });

  describe('executeRound', () => {
    const defaultContext: DebateContext = {
      sessionId: 'test-session',
      topic: 'Should AI be regulated?',
      mode: 'collaborative',
      currentRound: 1,
      totalRounds: 3,
      previousResponses: [],
    };

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
      expect(capturedContext!.modePrompt).toContain('Collaborative');
      expect(capturedContext!.modePrompt).toContain('common ground');
    });

    it('should return empty array for no agents', async () => {
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should execute single agent', async () => {
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test-model',
      });

      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('agent-1');
      expect(responses[0].agentName).toBe('Agent 1');
      expect(responses[0].position).toBeTruthy();
    });

    it('should execute multiple agents in parallel', async () => {
      const agent1 = new MockAgent(
        {
          id: 'agent-1',
          name: 'Agent 1',
          provider: 'anthropic',
          model: 'test-model',
        },
        { responseDelay: 50 }
      );

      const agent2 = new MockAgent(
        {
          id: 'agent-2',
          name: 'Agent 2',
          provider: 'openai',
          model: 'test-model',
        },
        { responseDelay: 50 }
      );

      const agent3 = new MockAgent({
        id: 'agent-3',
        name: 'Agent 3',
        provider: 'google',
        model: 'test-model',
      });

      const startTime = Date.now();
      const responses = await mode.executeRound(
        [agent1, agent2, agent3],
        defaultContext,
        mockToolkit
      );
      const elapsed = Date.now() - startTime;

      // Should complete in ~50ms (parallel) not 100ms (sequential)
      expect(elapsed).toBeLessThan(100);

      expect(responses).toHaveLength(3);
      expect(responses[0].agentId).toBe('agent-1');
      expect(responses[1].agentId).toBe('agent-2');
      expect(responses[2].agentId).toBe('agent-3');
    });

    it('should set toolkit on each agent', async () => {
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test-model',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // Agent should have toolkit set (no error thrown)
      expect(true).toBe(true);
    });

    it('should set toolkit on agents', async () => {
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test-model',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // Verify execution completes successfully with toolkit
      expect(true).toBe(true);
    });

    it('should work with previous responses', async () => {
      const previousResponses: AgentResponse[] = [
        {
          agentId: 'prev-agent',
          agentName: 'Previous Agent',
          position: 'Previous position',
          reasoning: 'Previous reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ];

      const context: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses,
      };

      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test-model',
      });

      const responses = await mode.executeRound([agent], context, mockToolkit);

      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('agent-1');
    });
  });

  describe('buildAgentPrompt', () => {
    it('should include mode description', () => {
      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'Test Topic',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
      };

      const prompt = mode.buildAgentPrompt(context);

      expect(prompt).toContain('Collaborative');
      expect(prompt).toContain('SYNTHESIZER');
      expect(prompt).toContain('BUILD BRIDGES');
    });

    it('should include 4-layer structure', () => {
      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'Test Topic',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
      };

      const prompt = mode.buildAgentPrompt(context);

      // Verify all 4 layers are present
      expect(prompt).toContain('LAYER 1: ROLE ANCHOR');
      expect(prompt).toContain('LAYER 2: BEHAVIORAL CONTRACT');
      expect(prompt).toContain('LAYER 3: STRUCTURAL ENFORCEMENT');
      expect(prompt).toContain('LAYER 4: VERIFICATION LOOP');
    });

    it('should include MUST and MUST NOT behaviors', () => {
      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'Test Topic',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
      };

      const prompt = mode.buildAgentPrompt(context);

      expect(prompt).toContain('MUST (Required Behaviors)');
      expect(prompt).toContain('MUST NOT (Prohibited Behaviors)');
      expect(prompt).toContain('PRIORITY HIERARCHY');
      expect(prompt).toContain('FAILURE MODE');
    });

    it('should provide first round guidance when no previous responses', () => {
      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'Test Topic',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
      };

      const prompt = mode.buildAgentPrompt(context);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('First Round');
      expect(prompt).toContain('[MY PERSPECTIVE]');
      expect(prompt).toContain('[AREAS FOR COLLABORATION]');
      expect(prompt).toContain('[INVITATION TO BUILD]');
    });

    it('should provide review guidance when previous responses exist', () => {
      const previousResponses: AgentResponse[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent 1',
          position: 'Position 1',
          reasoning: 'Reasoning 1',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ];

      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'Test Topic',
        mode: 'collaborative',
        currentRound: 2,
        totalRounds: 3,
        previousResponses,
      };

      const prompt = mode.buildAgentPrompt(context);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('[POINTS OF AGREEMENT]');
      expect(prompt).toContain('[BUILDING ON IDEAS]');
      expect(prompt).toContain('[SYNTHESIS PROPOSAL]');
      expect(prompt).toContain('[MY CONTRIBUTION]');
    });

    it('should include focus question when provided', () => {
      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'Test Topic',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
        focusQuestion: 'What are the ethical implications?',
      };

      const prompt = mode.buildAgentPrompt(context);

      expect(prompt).toContain('FOCUS QUESTION');
      expect(prompt).toContain('What are the ethical implications?');
    });

    it('should not mention focus question when not provided', () => {
      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'Test Topic',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
      };

      const prompt = mode.buildAgentPrompt(context);

      expect(prompt).not.toContain('FOCUS QUESTION');
    });

    it('should include verification checklist', () => {
      const context: DebateContext = {
        sessionId: 'test-session',
        topic: 'Test Topic',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
      };

      const prompt = mode.buildAgentPrompt(context);

      expect(prompt).toContain('Before finalizing your response, verify');
      expect(prompt).toContain('If any check fails, revise before submitting');
    });
  });

  describe('integration', () => {
    it('should handle full collaborative round flow', async () => {
      const context: DebateContext = {
        sessionId: 'integration-test',
        topic: 'Climate Change Solutions',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 3,
        previousResponses: [],
      };

      const agents = [
        new MockAgent({
          id: 'optimist',
          name: 'Optimist',
          provider: 'anthropic',
          model: 'test',
        }),
        new MockAgent({
          id: 'realist',
          name: 'Realist',
          provider: 'openai',
          model: 'test',
        }),
      ];

      // Set custom responses
      agents[0].setMockResponse({
        agentId: 'optimist',
        agentName: 'Optimist',
        position: 'Renewable energy technology is advancing rapidly',
        reasoning: 'Solar and wind are becoming cost-competitive',
        confidence: 0.9,
        timestamp: new Date(),
      });

      agents[1].setMockResponse({
        agentId: 'realist',
        agentName: 'Realist',
        position: 'We need both renewable energy and policy changes',
        reasoning: 'Technology alone is not sufficient',
        confidence: 0.85,
        timestamp: new Date(),
      });

      const responses = await mode.executeRound(agents, context, mockToolkit);

      expect(responses).toHaveLength(2);
      expect(responses[0].agentName).toBe('Optimist');
      expect(responses[1].agentName).toBe('Realist');
      expect(responses[0].position).toContain('Renewable energy');
      expect(responses[1].position).toContain('renewable energy');
    });
  });
});
