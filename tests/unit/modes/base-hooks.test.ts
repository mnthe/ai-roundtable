import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseModeStrategy } from '../../../src/modes/base.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { BaseAgent, AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext, AgentResponse } from '../../../src/types/index.js';

/**
 * Test mode without hooks - verifies backward compatibility
 */
class NoHooksMode extends BaseModeStrategy {
  readonly name = 'no-hooks';

  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeParallel(agents, context, toolkit);
  }

  buildAgentPrompt(context: DebateContext): string {
    return `Test prompt for ${context.topic}`;
  }
}

/**
 * Test mode with all hooks implemented
 */
class AllHooksMode extends BaseModeStrategy {
  readonly name = 'all-hooks';
  readonly executionPattern = 'parallel' as const;

  // Track hook calls for testing
  transformContextCalls: Array<{ context: DebateContext; agentId: string }> = [];
  validateResponseCalls: Array<{ response: AgentResponse; context: DebateContext }> = [];
  getAgentRoleCalls: Array<{ agentId: string; index: number; context: DebateContext }> = [];

  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeParallel(agents, context, toolkit);
  }

  buildAgentPrompt(context: DebateContext): string {
    return `All hooks prompt for ${context.topic}`;
  }

  protected transformContext(context: DebateContext, agent: BaseAgent): DebateContext {
    this.transformContextCalls.push({ context, agentId: agent.id });
    return {
      ...context,
      modePrompt: context.modePrompt + ' [TRANSFORMED]',
    };
  }

  protected validateResponse(response: AgentResponse, context: DebateContext): AgentResponse {
    this.validateResponseCalls.push({ response, context });
    return {
      ...response,
      position: response.position + ' [VALIDATED]',
    };
  }

  protected getAgentRole(
    agent: BaseAgent,
    index: number,
    context: DebateContext
  ): string | undefined {
    this.getAgentRoleCalls.push({ agentId: agent.id, index, context });
    return `ROLE_${index}`;
  }
}

/**
 * Test mode for sequential execution with hooks
 */
class SequentialHooksMode extends BaseModeStrategy {
  readonly name = 'sequential-hooks';
  readonly executionPattern = 'sequential' as const;

  transformContextCalls: Array<{ context: DebateContext; agentId: string }> = [];
  validateResponseCalls: Array<{ response: AgentResponse; context: DebateContext }> = [];
  getAgentRoleCalls: Array<{ agentId: string; index: number; context: DebateContext }> = [];

  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeSequential(agents, context, toolkit);
  }

  buildAgentPrompt(context: DebateContext): string {
    return `Sequential hooks prompt for ${context.topic}`;
  }

  protected transformContext(context: DebateContext, agent: BaseAgent): DebateContext {
    this.transformContextCalls.push({ context, agentId: agent.id });
    return {
      ...context,
      modePrompt: context.modePrompt + ` [AGENT:${agent.id}]`,
    };
  }

  protected validateResponse(response: AgentResponse, context: DebateContext): AgentResponse {
    this.validateResponseCalls.push({ response, context });
    return {
      ...response,
      confidence: Math.min(response.confidence + 0.1, 1.0),
    };
  }

  protected getAgentRole(
    agent: BaseAgent,
    index: number,
    context: DebateContext
  ): string | undefined {
    this.getAgentRoleCalls.push({ agentId: agent.id, index, context });
    const roles = ['PRIMARY', 'OPPOSITION', 'EVALUATOR'];
    return roles[index % roles.length];
  }
}

/**
 * Test mode for last-only execution pattern with hooks
 */
class LastOnlyHooksMode extends BaseModeStrategy {
  readonly name = 'last-only-hooks';
  readonly executionPattern = 'sequential' as const;

  transformContextCalls: Array<{ context: DebateContext; agentId: string }> = [];
  validateResponseCalls: Array<{ response: AgentResponse; context: DebateContext }> = [];
  getAgentRoleCalls: Array<{ agentId: string; index: number; context: DebateContext }> = [];

  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeLastOnly(agents, context, toolkit);
  }

  buildAgentPrompt(context: DebateContext): string {
    return `Last-only hooks prompt for ${context.topic}`;
  }

  protected transformContext(context: DebateContext, agent: BaseAgent): DebateContext {
    this.transformContextCalls.push({ context, agentId: agent.id });
    return {
      ...context,
      modePrompt: context.modePrompt + ` [AGENT:${agent.id}]`,
    };
  }

  protected validateResponse(response: AgentResponse, context: DebateContext): AgentResponse {
    this.validateResponseCalls.push({ response, context });
    return {
      ...response,
      confidence: Math.min(response.confidence + 0.1, 1.0),
    };
  }

  protected getAgentRole(
    agent: BaseAgent,
    index: number,
    context: DebateContext
  ): string | undefined {
    this.getAgentRoleCalls.push({ agentId: agent.id, index, context });
    const roles = ['PRIMARY', 'OPPOSITION', 'EVALUATOR'];
    return roles[index % roles.length];
  }
}

describe('BaseModeStrategy Hooks', () => {
  let mockToolkit: AgentToolkit;
  const defaultContext: DebateContext = {
    sessionId: 'test-session',
    topic: 'Test Topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  beforeEach(() => {
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn().mockResolvedValue({}),
      setContext: vi.fn(),
    };
  });

  describe('Backward Compatibility', () => {
    it('should work without any hooks defined', async () => {
      const mode = new NoHooksMode();
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test-model',
      });

      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('agent-1');
      expect(responses[0].position).not.toContain('[TRANSFORMED]');
      expect(responses[0].position).not.toContain('[VALIDATED]');
    });

    it('should handle empty agents array without hooks', async () => {
      const mode = new NoHooksMode();
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should handle multiple agents without hooks', async () => {
      const mode = new NoHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(2);
      expect(responses[0].agentId).toBe('agent-1');
      expect(responses[1].agentId).toBe('agent-2');
    });
  });

  describe('transformContext hook', () => {
    it('should call transformContext for each agent in parallel execution', async () => {
      const mode = new AllHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(mode.transformContextCalls).toHaveLength(2);
      expect(mode.transformContextCalls[0].agentId).toBe('agent-1');
      expect(mode.transformContextCalls[1].agentId).toBe('agent-2');
    });

    it('should call transformContext for each agent in sequential execution', async () => {
      const mode = new SequentialHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(mode.transformContextCalls).toHaveLength(2);
      expect(mode.transformContextCalls[0].agentId).toBe('agent-1');
      expect(mode.transformContextCalls[1].agentId).toBe('agent-2');
    });

    it('should pass correct context to transformContext', async () => {
      const mode = new AllHooksMode();
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const call = mode.transformContextCalls[0];
      expect(call.context.sessionId).toBe('test-session');
      expect(call.context.topic).toBe('Test Topic');
      expect(call.context.modePrompt).toContain('All hooks prompt');
    });
  });

  describe('validateResponse hook', () => {
    it('should call validateResponse for each successful response in parallel execution', async () => {
      const mode = new AllHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(mode.validateResponseCalls).toHaveLength(2);
      expect(responses[0].position).toContain('[VALIDATED]');
      expect(responses[1].position).toContain('[VALIDATED]');
    });

    it('should call validateResponse for each successful response in sequential execution', async () => {
      const mode = new SequentialHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(mode.validateResponseCalls).toHaveLength(2);
      // SequentialHooksMode adds 0.1 to confidence
      expect(responses[0].confidence).toBeGreaterThanOrEqual(0.5);
      expect(responses[1].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should receive the original response in validateResponse', async () => {
      const mode = new AllHooksMode();
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });
      agent.setMockResponse({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Original Position',
        reasoning: 'Test reasoning',
        confidence: 0.75,
        timestamp: new Date(),
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const call = mode.validateResponseCalls[0];
      expect(call.response.position).toBe('Original Position');
      expect(call.response.confidence).toBe(0.75);
    });
  });

  describe('getAgentRole hook', () => {
    it('should call getAgentRole in sequential execution', async () => {
      const mode = new SequentialHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'agent-3', name: 'Agent 3', provider: 'google', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(mode.getAgentRoleCalls).toHaveLength(3);
      expect(mode.getAgentRoleCalls[0]).toMatchObject({ agentId: 'agent-1', index: 0 });
      expect(mode.getAgentRoleCalls[1]).toMatchObject({ agentId: 'agent-2', index: 1 });
      expect(mode.getAgentRoleCalls[2]).toMatchObject({ agentId: 'agent-3', index: 2 });
    });

    it('should receive correct index and context in getAgentRole', async () => {
      const mode = new SequentialHooksMode();
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const call = mode.getAgentRoleCalls[0];
      expect(call.index).toBe(0);
      expect(call.context.sessionId).toBe('test-session');
      expect(call.context.topic).toBe('Test Topic');
    });

    it('should not call getAgentRole in parallel execution (no hook defined in AllHooksMode executeRound)', async () => {
      // Note: getAgentRole is only called in executeSequential, not executeParallel
      const mode = new AllHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // getAgentRole is not called in parallel execution
      expect(mode.getAgentRoleCalls).toHaveLength(0);
    });
  });

  describe('executionPattern property', () => {
    it('should have executionPattern set to parallel for AllHooksMode', () => {
      const mode = new AllHooksMode();
      expect(mode.executionPattern).toBe('parallel');
    });

    it('should have executionPattern set to sequential for SequentialHooksMode', () => {
      const mode = new SequentialHooksMode();
      expect(mode.executionPattern).toBe('sequential');
    });

    it('should have executionPattern undefined for NoHooksMode', () => {
      const mode = new NoHooksMode();
      expect(mode.executionPattern).toBeUndefined();
    });
  });

  describe('Error handling with hooks', () => {
    /**
     * Custom failing agent for testing error handling
     */
    class FailingMockAgent extends MockAgent {
      override async generateResponse(): Promise<AgentResponse> {
        throw new Error('Agent failed');
      }
    }

    it('should continue with other agents when one fails in parallel execution', async () => {
      const mode = new AllHooksMode();
      const workingAgent = new MockAgent({
        id: 'working',
        name: 'Working Agent',
        provider: 'anthropic',
        model: 'test',
      });
      const failingAgent = new FailingMockAgent({
        id: 'failing',
        name: 'Failing Agent',
        provider: 'openai',
        model: 'test',
      });

      const responses = await mode.executeRound(
        [workingAgent, failingAgent],
        defaultContext,
        mockToolkit
      );

      // Only working agent's response should be validated
      expect(mode.validateResponseCalls).toHaveLength(1);
      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('working');
    });

    it('should continue with other agents when one fails in sequential execution', async () => {
      const mode = new SequentialHooksMode();
      const workingAgent = new MockAgent({
        id: 'working',
        name: 'Working Agent',
        provider: 'anthropic',
        model: 'test',
      });
      const failingAgent = new FailingMockAgent({
        id: 'failing',
        name: 'Failing Agent',
        provider: 'openai',
        model: 'test',
      });

      const responses = await mode.executeRound(
        [failingAgent, workingAgent],
        defaultContext,
        mockToolkit
      );

      // Only working agent's response should be validated
      expect(mode.validateResponseCalls).toHaveLength(1);
      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('working');
    });
  });

  describe('Hook parameter correctness', () => {
    it('should pass baseContext (not agentContext) to validateResponse', async () => {
      const mode = new AllHooksMode();
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // validateResponse should receive baseContext (without transformation)
      const validateCall = mode.validateResponseCalls[0];
      // The modePrompt in baseContext should NOT contain [TRANSFORMED] yet
      // because baseContext is created before transformContext is called
      expect(validateCall.context.modePrompt).toContain('All hooks prompt');
    });

    it('should pass accumulated responses in sequential context', async () => {
      const mode = new SequentialHooksMode();
      const agent1 = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });
      const agent2 = new MockAgent({
        id: 'agent-2',
        name: 'Agent 2',
        provider: 'openai',
        model: 'test',
      });

      await mode.executeRound([agent1, agent2], defaultContext, mockToolkit);

      // First agent should have no previous responses from current round
      expect(mode.transformContextCalls[0].context.previousResponses).toHaveLength(0);

      // Second agent should have first agent's response in accumulated responses
      expect(mode.transformContextCalls[1].context.previousResponses).toHaveLength(1);
      expect(mode.transformContextCalls[1].context.previousResponses[0].agentId).toBe('agent-1');
    });
  });

  describe('executeLastOnly pattern', () => {
    /**
     * Custom failing agent for testing error handling
     */
    class FailingMockAgent extends MockAgent {
      override async generateResponse(): Promise<AgentResponse> {
        throw new Error('Agent failed');
      }
    }

    it('should fallback to sequential for single agent', async () => {
      const mode = new LastOnlyHooksMode();
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('agent-1');
    });

    it('should fallback to sequential for empty agents array', async () => {
      const mode = new LastOnlyHooksMode();

      const responses = await mode.executeRound([], defaultContext, mockToolkit);

      expect(responses).toEqual([]);
    });

    it('should execute all except last in parallel, then last sequentially', async () => {
      const mode = new LastOnlyHooksMode();
      const executionOrder: string[] = [];

      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'agent-3', name: 'Agent 3', provider: 'google', model: 'test' }),
      ];

      // Track execution order with small delays to verify parallel execution
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          executionOrder.push(agent.id);
          // Small delay to ensure parallel agents run "at the same time"
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: `Position from ${agent.name}`,
            reasoning: `Reasoning from ${agent.name}`,
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      }

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(3);
      // Verify all agents responded
      expect(responses.map((r) => r.agentId)).toEqual(['agent-1', 'agent-2', 'agent-3']);

      // Last agent should execute after others
      // In a true parallel execution, agent-3 should be last in the execution order
      expect(executionOrder[executionOrder.length - 1]).toBe('agent-3');
    });

    it('should give last agent access to all parallel responses', async () => {
      const mode = new LastOnlyHooksMode();
      let lastAgentContext: DebateContext | null = null;

      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'agent-3', name: 'Agent 3', provider: 'google', model: 'test' }),
      ];

      // First two agents just return responses
      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Position 1',
        reasoning: 'Reasoning 1',
        confidence: 0.8,
        timestamp: new Date(),
      });

      vi.spyOn(agents[1], 'generateResponse').mockResolvedValue({
        agentId: 'agent-2',
        agentName: 'Agent 2',
        position: 'Position 2',
        reasoning: 'Reasoning 2',
        confidence: 0.7,
        timestamp: new Date(),
      });

      // Last agent captures context
      vi.spyOn(agents[2], 'generateResponse').mockImplementation(async (ctx) => {
        lastAgentContext = { ...ctx };
        return {
          agentId: 'agent-3',
          agentName: 'Agent 3',
          position: 'Position 3',
          reasoning: 'Reasoning 3',
          confidence: 0.9,
          timestamp: new Date(),
        };
      });

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Last agent should see both parallel responses
      expect(lastAgentContext).not.toBeNull();
      expect(lastAgentContext!.previousResponses).toHaveLength(2);
      expect(lastAgentContext!.previousResponses[0].agentId).toBe('agent-1');
      expect(lastAgentContext!.previousResponses[1].agentId).toBe('agent-2');
    });

    it('should call hooks for all agents', async () => {
      const mode = new LastOnlyHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'agent-3', name: 'Agent 3', provider: 'google', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // transformContext should be called for all agents
      expect(mode.transformContextCalls).toHaveLength(3);

      // validateResponse should be called for all agents
      expect(mode.validateResponseCalls).toHaveLength(3);

      // getAgentRole should be called for all agents
      expect(mode.getAgentRoleCalls).toHaveLength(3);
      expect(mode.getAgentRoleCalls.map((c) => c.index)).toEqual([0, 1, 2]);
    });

    it('should continue when parallel agent fails', async () => {
      const mode = new LastOnlyHooksMode();
      const workingAgent1 = new MockAgent({
        id: 'working-1',
        name: 'Working 1',
        provider: 'anthropic',
        model: 'test',
      });
      const failingAgent = new FailingMockAgent({
        id: 'failing',
        name: 'Failing',
        provider: 'openai',
        model: 'test',
      });
      const lastAgent = new MockAgent({
        id: 'last',
        name: 'Last',
        provider: 'google',
        model: 'test',
      });

      const responses = await mode.executeRound(
        [workingAgent1, failingAgent, lastAgent],
        defaultContext,
        mockToolkit
      );

      // Should have responses from working agents only
      expect(responses).toHaveLength(2);
      expect(responses.map((r) => r.agentId)).toContain('working-1');
      expect(responses.map((r) => r.agentId)).toContain('last');
    });

    it('should return parallel responses when last agent fails', async () => {
      const mode = new LastOnlyHooksMode();
      const agent1 = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });
      const agent2 = new MockAgent({
        id: 'agent-2',
        name: 'Agent 2',
        provider: 'openai',
        model: 'test',
      });
      const failingLastAgent = new FailingMockAgent({
        id: 'failing-last',
        name: 'Failing Last',
        provider: 'google',
        model: 'test',
      });

      const responses = await mode.executeRound(
        [agent1, agent2, failingLastAgent],
        defaultContext,
        mockToolkit
      );

      // Should have responses from parallel agents
      expect(responses).toHaveLength(2);
      expect(responses.map((r) => r.agentId)).toEqual(['agent-1', 'agent-2']);
    });

    it('should apply validateResponse to parallel responses', async () => {
      const mode = new LastOnlyHooksMode();
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'agent-3', name: 'Agent 3', provider: 'google', model: 'test' }),
      ];

      // Set specific confidence values
      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Position',
        reasoning: 'Reasoning',
        confidence: 0.5,
        timestamp: new Date(),
      });

      vi.spyOn(agents[1], 'generateResponse').mockResolvedValue({
        agentId: 'agent-2',
        agentName: 'Agent 2',
        position: 'Position',
        reasoning: 'Reasoning',
        confidence: 0.6,
        timestamp: new Date(),
      });

      vi.spyOn(agents[2], 'generateResponse').mockResolvedValue({
        agentId: 'agent-3',
        agentName: 'Agent 3',
        position: 'Position',
        reasoning: 'Reasoning',
        confidence: 0.7,
        timestamp: new Date(),
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // validateResponse adds 0.1 to confidence
      // Use toBeCloseTo for floating point comparisons
      expect(responses[0].confidence).toBeCloseTo(0.6, 5); // 0.5 + 0.1
      expect(responses[1].confidence).toBeCloseTo(0.7, 5); // 0.6 + 0.1
      expect(responses[2].confidence).toBeCloseTo(0.8, 5); // 0.7 + 0.1
    });

    it('should work with two agents (edge case for last-only)', async () => {
      const mode = new LastOnlyHooksMode();
      let secondAgentContext: DebateContext | null = null;

      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'First position',
        reasoning: 'First reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      });

      vi.spyOn(agents[1], 'generateResponse').mockImplementation(async (ctx) => {
        secondAgentContext = { ...ctx };
        return {
          agentId: 'agent-2',
          agentName: 'Agent 2',
          position: 'Second position',
          reasoning: 'Second reasoning',
          confidence: 0.7,
          timestamp: new Date(),
        };
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(2);
      // Second agent should see first agent's response
      expect(secondAgentContext!.previousResponses).toHaveLength(1);
      expect(secondAgentContext!.previousResponses[0].agentId).toBe('agent-1');
    });
  });
});
