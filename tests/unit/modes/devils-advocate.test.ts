import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DevilsAdvocateMode } from '../../../src/modes/devils-advocate.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext, AgentResponse } from '../../../src/types/index.js';

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

    it('should have sequential execution pattern', () => {
      expect(mode.executionPattern).toBe('sequential');
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

    it('should instruct primary position to take AFFIRMATIVE stance with stance field', () => {
      const firstPrompt = mode.buildAgentPrompt(defaultContext);
      expect(firstPrompt.toUpperCase()).toContain('AFFIRMATIVE');
      // Should require stance: "YES" in JSON response
      expect(firstPrompt).toContain('"stance": "YES"');
      // Should explicitly forbid hedging language
      expect(firstPrompt).toContain('FORBIDDEN PHRASES');
      expect(firstPrompt).toContain('However');
    });

    it('should provide different prompts for different roles', () => {
      // First agent (no previous responses)
      const firstPrompt = mode.buildAgentPrompt(defaultContext);
      expect(firstPrompt.toUpperCase()).toContain('PRIMARY POSITION');

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
      expect(secondPrompt.toUpperCase()).toContain('OPPOSITION');

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
      expect(thirdPrompt.toUpperCase()).toContain('EVALUATOR');
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

    it('should assign correct roles for 4+ agents', async () => {
      const receivedPrompts: string[] = [];
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'agent-3', name: 'Evaluator1', provider: 'google', model: 'mock' }),
        new MockAgent({ id: 'agent-4', name: 'Evaluator2', provider: 'perplexity', model: 'mock' }),
      ];

      // Mock each agent to capture the modePrompt it receives
      for (let i = 0; i < agents.length; i++) {
        vi.spyOn(agents[i], 'generateResponse').mockImplementation(async (ctx) => {
          receivedPrompts.push(ctx.modePrompt ?? '');
          // Simulate different timestamps (sequential execution)
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: agents[i].id,
            agentName: agents[i].name,
            position: `Position from ${agents[i].name}`,
            reasoning: `Reasoning from ${agents[i].name}`,
            confidence: 0.75,
            timestamp: new Date(),
          };
        });
      }

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(receivedPrompts).toHaveLength(4);
      // Agent 0: Primary Position (case-insensitive checks)
      expect(receivedPrompts[0].toUpperCase()).toContain('PRIMARY POSITION');
      expect(receivedPrompts[0].toUpperCase()).not.toContain('OPPOSITION ROLE');
      expect(receivedPrompts[0].toUpperCase()).not.toContain('EVALUATOR ROLE');

      // Agent 1: Opposition Role
      expect(receivedPrompts[1].toUpperCase()).toContain('OPPOSITION ROLE');
      expect(receivedPrompts[1].toUpperCase()).not.toContain('PRIMARY POSITION');
      expect(receivedPrompts[1].toUpperCase()).not.toContain('EVALUATOR ROLE');

      // Agent 2: Evaluator Role (NOT Opposition!)
      expect(receivedPrompts[2].toUpperCase()).toContain('EVALUATOR ROLE');
      expect(receivedPrompts[2].toUpperCase()).not.toContain('OPPOSITION ROLE');
      expect(receivedPrompts[2].toUpperCase()).not.toContain('PRIMARY POSITION');

      // Agent 3: Evaluator Role (NOT Opposition!)
      expect(receivedPrompts[3].toUpperCase()).toContain('EVALUATOR ROLE');
      expect(receivedPrompts[3].toUpperCase()).not.toContain('OPPOSITION ROLE');
      expect(receivedPrompts[3].toUpperCase()).not.toContain('PRIMARY POSITION');
    });

    it('should maintain correct roles across multiple rounds', async () => {
      const round1Prompts: string[] = [];
      const round2Prompts: string[] = [];
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'agent-3', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      // Round 1
      for (let i = 0; i < agents.length; i++) {
        vi.spyOn(agents[i], 'generateResponse').mockImplementationOnce(async (ctx) => {
          round1Prompts.push(ctx.modePrompt ?? '');
          return {
            agentId: agents[i].id,
            agentName: agents[i].name,
            position: `Round 1 position from ${agents[i].name}`,
            reasoning: `Round 1 reasoning from ${agents[i].name}`,
            confidence: 0.75,
            timestamp: new Date(),
          };
        });
      }

      const round1Responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // Round 2 context includes round 1 responses
      const round2Context: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses: round1Responses,
      };

      for (let i = 0; i < agents.length; i++) {
        vi.spyOn(agents[i], 'generateResponse').mockImplementationOnce(async (ctx) => {
          round2Prompts.push(ctx.modePrompt ?? '');
          return {
            agentId: agents[i].id,
            agentName: agents[i].name,
            position: `Round 2 position from ${agents[i].name}`,
            reasoning: `Round 2 reasoning from ${agents[i].name}`,
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      }

      await mode.executeRound(agents, round2Context, mockToolkit);

      // Verify round 1 role assignment (case-insensitive)
      expect(round1Prompts[0].toUpperCase()).toContain('PRIMARY POSITION');
      expect(round1Prompts[1].toUpperCase()).toContain('OPPOSITION ROLE');
      expect(round1Prompts[2].toUpperCase()).toContain('EVALUATOR ROLE');

      // Verify round 2 role assignment (same roles)
      expect(round2Prompts[0].toUpperCase()).toContain('PRIMARY POSITION');
      expect(round2Prompts[1].toUpperCase()).toContain('OPPOSITION ROLE');
      expect(round2Prompts[2].toUpperCase()).toContain('EVALUATOR ROLE');

      // Verify round 2 prompts mention round number (case-insensitive)
      expect(round2Prompts[0].toLowerCase()).toContain('round 2');
      expect(round2Prompts[1].toLowerCase()).toContain('round 2');
      expect(round2Prompts[2].toLowerCase()).toContain('round 2');
    });

    it('should assign correct roles even with different timestamps in responses', async () => {
      // This test specifically verifies the bug fix where timestamp-based
      // filtering caused incorrect role assignment
      const receivedPrompts: string[] = [];
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'agent-3', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      // Mock with explicit time delays to ensure different timestamps
      for (let i = 0; i < agents.length; i++) {
        vi.spyOn(agents[i], 'generateResponse').mockImplementation(async (ctx) => {
          receivedPrompts.push(ctx.modePrompt ?? '');
          // Simulate varying delays (sequential execution with different timestamps)
          await new Promise((resolve) => setTimeout(resolve, 50 + i * 20));
          return {
            agentId: agents[i].id,
            agentName: agents[i].name,
            position: `Position from ${agents[i].name}`,
            reasoning: `Reasoning from ${agents[i].name}`,
            confidence: 0.75,
            timestamp: new Date(), // Each will have a different timestamp
          };
        });
      }

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // All roles should be correctly assigned despite different timestamps (case-insensitive)
      expect(receivedPrompts[0].toUpperCase()).toContain('PRIMARY POSITION');
      expect(receivedPrompts[1].toUpperCase()).toContain('OPPOSITION ROLE');
      expect(receivedPrompts[2].toUpperCase()).toContain('EVALUATOR ROLE');
    });
  });

  describe('stance validation (validateResponse hook)', () => {
    it('should mark role violation when primary agent has no stance (no force-correction)', async () => {
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Primary', provider: 'anthropic', model: 'mock' }),
      ];

      // Agent responds without stance
      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Primary',
        position: 'Pro position',
        reasoning: 'Pro reasoning',
        confidence: 0.8,
        timestamp: new Date(),
        // No stance provided
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // StanceValidator no longer force-corrects, just marks violation
      expect(responses[0].stance).toBeUndefined();
      expect(responses[0]._roleViolation).toEqual({ expected: 'YES', actual: null });
    });

    it('should mark role violation when opposition agent has wrong stance (no force-correction)', async () => {
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Opposition', provider: 'openai', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Primary',
        position: 'Pro position',
        reasoning: 'Pro reasoning',
        confidence: 0.8,
        timestamp: new Date(),
        stance: 'YES',
      });

      // Opposition agent responds with wrong stance
      vi.spyOn(agents[1], 'generateResponse').mockResolvedValue({
        agentId: 'agent-2',
        agentName: 'Opposition',
        position: 'Counter position',
        reasoning: 'Counter reasoning',
        confidence: 0.7,
        timestamp: new Date(),
        stance: 'YES', // Wrong stance
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // First agent: correct stance, no violation
      expect(responses[0].stance).toBe('YES');
      expect(responses[0]._roleViolation).toBeUndefined();
      // Second agent: wrong stance preserved, violation marked
      expect(responses[1].stance).toBe('YES');
      expect(responses[1]._roleViolation).toEqual({ expected: 'NO', actual: 'YES' });
    });

    it('should mark role violation when evaluator has wrong stance (no force-correction)', async () => {
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'agent-3', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Primary',
        position: 'Pro position',
        reasoning: 'Pro reasoning',
        confidence: 0.8,
        timestamp: new Date(),
        stance: 'YES',
      });

      vi.spyOn(agents[1], 'generateResponse').mockResolvedValue({
        agentId: 'agent-2',
        agentName: 'Opposition',
        position: 'Counter position',
        reasoning: 'Counter reasoning',
        confidence: 0.7,
        timestamp: new Date(),
        stance: 'NO',
      });

      // Evaluator responds with wrong stance
      vi.spyOn(agents[2], 'generateResponse').mockResolvedValue({
        agentId: 'agent-3',
        agentName: 'Evaluator',
        position: 'Evaluation',
        reasoning: 'Analysis',
        confidence: 0.75,
        timestamp: new Date(),
        stance: 'YES', // Wrong stance
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses[0].stance).toBe('YES');
      expect(responses[0]._roleViolation).toBeUndefined();
      expect(responses[1].stance).toBe('NO');
      expect(responses[1]._roleViolation).toBeUndefined();
      // Evaluator: wrong stance preserved, violation marked
      expect(responses[2].stance).toBe('YES');
      expect(responses[2]._roleViolation).toEqual({ expected: 'NEUTRAL', actual: 'YES' });
    });

    it('should not mark violation when stance is correct', async () => {
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'agent-3', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      const responses = [
        {
          agentId: 'agent-1',
          agentName: 'Primary',
          position: 'Pro position',
          reasoning: 'Pro reasoning',
          confidence: 0.8,
          timestamp: new Date(),
          stance: 'YES' as const,
        },
        {
          agentId: 'agent-2',
          agentName: 'Opposition',
          position: 'Counter position',
          reasoning: 'Counter reasoning',
          confidence: 0.7,
          timestamp: new Date(),
          stance: 'NO' as const,
        },
        {
          agentId: 'agent-3',
          agentName: 'Evaluator',
          position: 'Evaluation',
          reasoning: 'Analysis',
          confidence: 0.75,
          timestamp: new Date(),
          stance: 'NEUTRAL' as const,
        },
      ];

      for (let i = 0; i < agents.length; i++) {
        vi.spyOn(agents[i], 'generateResponse').mockResolvedValue(responses[i]);
      }

      const results = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(results[0].stance).toBe('YES');
      expect(results[0]._roleViolation).toBeUndefined();
      expect(results[1].stance).toBe('NO');
      expect(results[1]._roleViolation).toBeUndefined();
      expect(results[2].stance).toBe('NEUTRAL');
      expect(results[2]._roleViolation).toBeUndefined();
    });

    it('should reset agent index tracker between rounds', async () => {
      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Opposition', provider: 'openai', model: 'mock' }),
      ];

      // Round 1 - agents respond without stance
      for (let i = 0; i < agents.length; i++) {
        vi.spyOn(agents[i], 'generateResponse').mockResolvedValueOnce({
          agentId: agents[i].id,
          agentName: agents[i].name,
          position: `Round 1 position from ${agents[i].name}`,
          reasoning: `Round 1 reasoning from ${agents[i].name}`,
          confidence: 0.75,
          timestamp: new Date(),
          // No stance
        });
      }

      const round1Results = await mode.executeRound(agents, defaultContext, mockToolkit);

      // Verify round 1: violations marked (not force-corrected)
      expect(round1Results[0].stance).toBeUndefined();
      expect(round1Results[0]._roleViolation).toEqual({ expected: 'YES', actual: null });
      expect(round1Results[1].stance).toBeUndefined();
      expect(round1Results[1]._roleViolation).toEqual({ expected: 'NO', actual: null });

      // Round 2 - agents respond without stance again
      const round2Context: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses: round1Results,
      };

      for (let i = 0; i < agents.length; i++) {
        vi.spyOn(agents[i], 'generateResponse').mockResolvedValueOnce({
          agentId: agents[i].id,
          agentName: agents[i].name,
          position: `Round 2 position from ${agents[i].name}`,
          reasoning: `Round 2 reasoning from ${agents[i].name}`,
          confidence: 0.8,
          timestamp: new Date(),
          // No stance
        });
      }

      const round2Results = await mode.executeRound(agents, round2Context, mockToolkit);

      // Verify round 2: violations still marked correctly (index reset working)
      expect(round2Results[0].stance).toBeUndefined();
      expect(round2Results[0]._roleViolation).toEqual({ expected: 'YES', actual: null });
      expect(round2Results[1].stance).toBeUndefined();
      expect(round2Results[1]._roleViolation).toEqual({ expected: 'NO', actual: null });
    });
  });

  describe('getAgentRole hook', () => {
    it('should return PRIMARY for index 0', () => {
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Test',
        provider: 'anthropic',
        model: 'mock',
      });

      // Access protected method via any cast (for testing)
      const role = (mode as any).getAgentRole(agent, 0, defaultContext);
      expect(role).toBe('PRIMARY');
    });

    it('should return OPPOSITION for index 1', () => {
      const agent = new MockAgent({
        id: 'agent-2',
        name: 'Test',
        provider: 'anthropic',
        model: 'mock',
      });

      const role = (mode as any).getAgentRole(agent, 1, defaultContext);
      expect(role).toBe('OPPOSITION');
    });

    it('should return EVALUATOR for index 2 and above', () => {
      const agent = new MockAgent({
        id: 'agent-3',
        name: 'Test',
        provider: 'anthropic',
        model: 'mock',
      });

      expect((mode as any).getAgentRole(agent, 2, defaultContext)).toBe('EVALUATOR');
      expect((mode as any).getAgentRole(agent, 3, defaultContext)).toBe('EVALUATOR');
      expect((mode as any).getAgentRole(agent, 10, defaultContext)).toBe('EVALUATOR');
    });
  });

  describe('sequential parallelization (last-only)', () => {
    let parallelizedMode: DevilsAdvocateMode;

    beforeEach(() => {
      parallelizedMode = new DevilsAdvocateMode({
        sequentialParallelization: {
          enabled: true,
          level: 'last-only',
        },
      });
    });

    it('should use sequential execution when parallelization is disabled', async () => {
      // Default mode (no parallelization)
      const executionOrder: string[] = [];
      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'evaluator', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          executionOrder.push(agent.id);
          // Delay to track order
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: 'Position',
            reasoning: 'Reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      }

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Sequential: strict order
      expect(executionOrder).toEqual(['primary', 'opposition', 'evaluator']);
    });

    it('should use last-only execution when enabled with 3 agents', async () => {
      const executionOrder: string[] = [];
      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'evaluator', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          executionOrder.push(agent.id);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: 'Position',
            reasoning: 'Reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      }

      const responses = await parallelizedMode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(3);
      // Evaluator should always be last
      expect(executionOrder[executionOrder.length - 1]).toBe('evaluator');
    });

    it('should not use parallelization with fewer than 3 agents', async () => {
      const executionOrder: string[] = [];
      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
      ];

      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          executionOrder.push(agent.id);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: 'Position',
            reasoning: 'Reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      }

      await parallelizedMode.executeRound(agents, defaultContext, mockToolkit);

      // With 2 agents, should still be sequential
      expect(executionOrder).toEqual(['primary', 'opposition']);
    });

    it('should give evaluator access to both PRIMARY and OPPOSITION responses', async () => {
      let evaluatorContext: DebateContext | null = null;
      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'evaluator', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'primary',
        agentName: 'Primary',
        position: 'Pro position',
        reasoning: 'Pro reasoning',
        confidence: 0.8,
        timestamp: new Date(),
        stance: 'YES',
      });

      vi.spyOn(agents[1], 'generateResponse').mockResolvedValue({
        agentId: 'opposition',
        agentName: 'Opposition',
        position: 'Counter position',
        reasoning: 'Counter reasoning',
        confidence: 0.7,
        timestamp: new Date(),
        stance: 'NO',
      });

      vi.spyOn(agents[2], 'generateResponse').mockImplementation(async (ctx) => {
        evaluatorContext = { ...ctx };
        return {
          agentId: 'evaluator',
          agentName: 'Evaluator',
          position: 'Evaluation',
          reasoning: 'Analysis',
          confidence: 0.75,
          timestamp: new Date(),
          stance: 'NEUTRAL',
        };
      });

      await parallelizedMode.executeRound(agents, defaultContext, mockToolkit);

      // Evaluator should see both responses
      expect(evaluatorContext).not.toBeNull();
      expect(evaluatorContext!.previousResponses).toHaveLength(2);
      const responseIds = evaluatorContext!.previousResponses.map((r) => r.agentId);
      expect(responseIds).toContain('primary');
      expect(responseIds).toContain('opposition');
    });

    it('should mark role violations when agents return without expected stance (no force-correction)', async () => {
      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'evaluator', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      // All agents return without stance
      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockResolvedValue({
          agentId: agent.id,
          agentName: agent.name,
          position: 'Position',
          reasoning: 'Reasoning',
          confidence: 0.8,
          timestamp: new Date(),
          // No stance
        });
      }

      const responses = await parallelizedMode.executeRound(agents, defaultContext, mockToolkit);

      // StanceValidator no longer force-corrects, just marks violations
      // Original stance (undefined) is preserved
      expect(responses[0].stance).toBeUndefined();
      expect(responses[1].stance).toBeUndefined();
      expect(responses[2].stance).toBeUndefined();

      // Role violations are marked
      expect(responses[0]._roleViolation).toEqual({ expected: 'YES', actual: null });
      expect(responses[1]._roleViolation).toEqual({ expected: 'NO', actual: null });
      expect(responses[2]._roleViolation).toEqual({ expected: 'NEUTRAL', actual: null });
    });

    it('should handle 4+ agents with parallelization (multiple evaluators)', async () => {
      let eval1Context: DebateContext | null = null;
      let eval2Context: DebateContext | null = null;

      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'eval1', name: 'Evaluator 1', provider: 'google', model: 'mock' }),
        new MockAgent({ id: 'eval2', name: 'Evaluator 2', provider: 'perplexity', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'primary',
        agentName: 'Primary',
        position: 'Pro position',
        reasoning: 'Pro reasoning',
        confidence: 0.8,
        timestamp: new Date(),
        stance: 'YES',
      });

      vi.spyOn(agents[1], 'generateResponse').mockResolvedValue({
        agentId: 'opposition',
        agentName: 'Opposition',
        position: 'Counter position',
        reasoning: 'Counter reasoning',
        confidence: 0.7,
        timestamp: new Date(),
        stance: 'NO',
      });

      vi.spyOn(agents[2], 'generateResponse').mockImplementation(async (ctx) => {
        eval1Context = { ...ctx };
        return {
          agentId: 'eval1',
          agentName: 'Evaluator 1',
          position: 'Evaluation 1',
          reasoning: 'Analysis 1',
          confidence: 0.75,
          timestamp: new Date(),
          stance: 'NEUTRAL',
        };
      });

      vi.spyOn(agents[3], 'generateResponse').mockImplementation(async (ctx) => {
        eval2Context = { ...ctx };
        return {
          agentId: 'eval2',
          agentName: 'Evaluator 2',
          position: 'Evaluation 2',
          reasoning: 'Analysis 2',
          confidence: 0.8,
          timestamp: new Date(),
          stance: 'NEUTRAL',
        };
      });

      const responses = await parallelizedMode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(4);

      // First evaluator should see PRIMARY and OPPOSITION
      expect(eval1Context).not.toBeNull();
      expect(eval1Context!.previousResponses).toHaveLength(2);

      // Second evaluator should see PRIMARY, OPPOSITION, and first evaluator
      expect(eval2Context).not.toBeNull();
      expect(eval2Context!.previousResponses).toHaveLength(3);

      // All stances should be correct
      expect(responses[0].stance).toBe('YES');
      expect(responses[1].stance).toBe('NO');
      expect(responses[2].stance).toBe('NEUTRAL');
      expect(responses[3].stance).toBe('NEUTRAL');
    });

    it('should handle agent failures gracefully with parallelization', async () => {
      /**
       * Custom failing agent for testing
       */
      class FailingMockAgent extends MockAgent {
        override async generateResponse(): Promise<AgentResponse> {
          throw new Error('Agent failed');
        }
      }

      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new FailingMockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'evaluator', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'primary',
        agentName: 'Primary',
        position: 'Pro position',
        reasoning: 'Pro reasoning',
        confidence: 0.8,
        timestamp: new Date(),
        stance: 'YES',
      });

      vi.spyOn(agents[2], 'generateResponse').mockResolvedValue({
        agentId: 'evaluator',
        agentName: 'Evaluator',
        position: 'Evaluation',
        reasoning: 'Analysis',
        confidence: 0.75,
        timestamp: new Date(),
        stance: 'NEUTRAL',
      });

      const responses = await parallelizedMode.executeRound(agents, defaultContext, mockToolkit);

      // Should have responses from working agents
      expect(responses).toHaveLength(2);
      expect(responses.map((r) => r.agentId)).toContain('primary');
      expect(responses.map((r) => r.agentId)).toContain('evaluator');
    });

    it('should not use parallelization when level is not last-only', async () => {
      const noneMode = new DevilsAdvocateMode({
        sequentialParallelization: {
          enabled: true,
          level: 'none', // Not 'last-only'
        },
      });

      const executionOrder: string[] = [];
      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'evaluator', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          executionOrder.push(agent.id);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: 'Position',
            reasoning: 'Reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      }

      await noneMode.executeRound(agents, defaultContext, mockToolkit);

      // Should be strictly sequential
      expect(executionOrder).toEqual(['primary', 'opposition', 'evaluator']);
    });

    it('should not use parallelization when enabled is false', async () => {
      const disabledMode = new DevilsAdvocateMode({
        sequentialParallelization: {
          enabled: false,
          level: 'last-only',
        },
      });

      const executionOrder: string[] = [];
      const agents = [
        new MockAgent({ id: 'primary', name: 'Primary', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'opposition', name: 'Opposition', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'evaluator', name: 'Evaluator', provider: 'google', model: 'mock' }),
      ];

      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          executionOrder.push(agent.id);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: 'Position',
            reasoning: 'Reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      }

      await disabledMode.executeRound(agents, defaultContext, mockToolkit);

      // Should be strictly sequential
      expect(executionOrder).toEqual(['primary', 'opposition', 'evaluator']);
    });
  });
});
