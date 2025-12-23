import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedTeamBlueTeamMode } from '../../../src/modes/red-team-blue-team.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext } from '../../../src/types/index.js';

describe('RedTeamBlueTeamMode', () => {
  let mode: RedTeamBlueTeamMode;
  let mockToolkit: AgentToolkit;

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Proposed security architecture for the new system',
    mode: 'red-team-blue-team',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  beforeEach(() => {
    mode = new RedTeamBlueTeamMode();
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
      expect(mode.name).toBe('red-team-blue-team');
    });
  });

  describe('getAgentRole hook', () => {
    it('should assign red team to even indices', () => {
      const agent = new MockAgent({
        id: 'agent-0',
        name: 'Agent',
        provider: 'anthropic',
        model: 'mock',
      });
      // Access protected method for testing
      const role = (mode as any).getAgentRole(agent, 0, defaultContext);
      expect(role).toBe('red');

      const role2 = (mode as any).getAgentRole(agent, 2, defaultContext);
      expect(role2).toBe('red');

      const role4 = (mode as any).getAgentRole(agent, 4, defaultContext);
      expect(role4).toBe('red');
    });

    it('should assign blue team to odd indices', () => {
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent',
        provider: 'anthropic',
        model: 'mock',
      });
      // Access protected method for testing
      const role = (mode as any).getAgentRole(agent, 1, defaultContext);
      expect(role).toBe('blue');

      const role3 = (mode as any).getAgentRole(agent, 3, defaultContext);
      expect(role3).toBe('blue');

      const role5 = (mode as any).getAgentRole(agent, 5, defaultContext);
      expect(role5).toBe('blue');
    });
  });

  describe('executeRound', () => {
    it('should return empty array for no agents', async () => {
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should divide agents into red and blue teams by index', async () => {
      const agents = [
        new MockAgent({ id: 'agent-0', name: 'Red 1', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'agent-1', name: 'Blue 1', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'agent-2', name: 'Red 2', provider: 'google', model: 'mock' }),
        new MockAgent({ id: 'agent-3', name: 'Blue 2', provider: 'perplexity', model: 'mock' }),
      ];

      agents.forEach((agent) => {
        vi.spyOn(agent, 'generateResponse').mockResolvedValue({
          agentId: agent.id,
          agentName: agent.name,
          position: `Position from ${agent.name}`,
          reasoning: `Reasoning from ${agent.name}`,
          confidence: 0.8,
          timestamp: new Date(),
        });
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(4);
      // Verify all agents were called
      for (const agent of agents) {
        expect(agent.generateResponse).toHaveBeenCalled();
      }
    });

    it('should execute both teams in parallel', async () => {
      const startTimes: Map<string, number> = new Map();
      const agents = [
        new MockAgent({ id: 'red-1', name: 'Red 1', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'blue-1', name: 'Blue 1', provider: 'openai', model: 'mock' }),
      ];

      for (const agent of agents) {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          startTimes.set(agent.id, Date.now());
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

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Both teams should start at approximately the same time (parallel)
      const times = Array.from(startTimes.values());
      const maxTimeDiff = Math.max(...times) - Math.min(...times);
      expect(maxTimeDiff).toBeLessThan(50); // Within 50ms of each other
    });

    it('should handle single agent gracefully', async () => {
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Solo Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockResolvedValue({
        agentId: 'agent-1',
        agentName: 'Solo Agent',
        position: 'Defense position',
        reasoning: 'Defense reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      });

      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);
      expect(responses).toHaveLength(1);
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

    it('should interleave responses to maintain agent order', async () => {
      const agents = [
        new MockAgent({ id: 'red-1', name: 'Red 1', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'blue-1', name: 'Blue 1', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'red-2', name: 'Red 2', provider: 'google', model: 'mock' }),
        new MockAgent({ id: 'blue-2', name: 'Blue 2', provider: 'perplexity', model: 'mock' }),
      ];

      agents.forEach((agent) => {
        vi.spyOn(agent, 'generateResponse').mockResolvedValue({
          agentId: agent.id,
          agentName: agent.name,
          position: 'Position',
          reasoning: 'Reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        });
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // Responses should be interleaved: red-1, blue-1, red-2, blue-2
      expect(responses).toHaveLength(4);
      expect(responses[0]?.agentId).toBe('red-1');
      expect(responses[1]?.agentId).toBe('blue-1');
      expect(responses[2]?.agentId).toBe('red-2');
      expect(responses[3]?.agentId).toBe('blue-2');
    });
  });

  describe('buildAgentPrompt', () => {
    it('should return base prompt with mode overview', () => {
      // buildAgentPrompt now returns only the base prompt
      // Team-specific content is added by transformContext
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt.toLowerCase()).toContain('red team/blue team');
      expect(prompt).toContain('RED TEAM');
      expect(prompt).toContain('BLUE TEAM');
    });

    it('should mention that team assignment will be provided', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);
      expect(prompt.toLowerCase()).toContain('team assignment');
    });

    it('should describe both team roles in base prompt', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);
      // Red team description
      expect(prompt.toLowerCase()).toMatch(/attack|criticize|vulnerabilities|risks/);
      // Blue team description
      expect(prompt.toLowerCase()).toMatch(/defend|build|solutions|mitigate/);
    });
  });

  describe('team dynamics', () => {
    it('should support iterative attack-defense cycles', async () => {
      // Round 2 with previous responses
      const contextRound2: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses: [
          {
            agentId: 'red-1',
            agentName: 'Red Team',
            position: 'Initial attack',
            reasoning: 'Attack reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          },
          {
            agentId: 'blue-1',
            agentName: 'Blue Team',
            position: 'Initial defense',
            reasoning: 'Defense reasoning',
            confidence: 0.85,
            timestamp: new Date(),
          },
        ],
      };

      const agents = [
        new MockAgent({ id: 'red-1', name: 'Red Team', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'blue-1', name: 'Blue Team', provider: 'openai', model: 'mock' }),
      ];

      const receivedContexts: DebateContext[] = [];

      agents.forEach((agent) => {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx) => {
          receivedContexts.push({ ...ctx });
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: 'Updated position',
            reasoning: 'Updated reasoning',
            confidence: 0.9,
            timestamp: new Date(),
          };
        });
      });

      await mode.executeRound(agents, contextRound2, mockToolkit);

      // Both teams should have access to previous round
      expect(receivedContexts.length).toBe(2);
      expect(receivedContexts[0]?.previousResponses.length).toBe(2);
    });

    it('should execute unbalanced teams correctly', async () => {
      // 3 agents: 2 red, 1 blue
      const agents = [
        new MockAgent({ id: 'red-1', name: 'Red 1', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'blue-1', name: 'Blue 1', provider: 'openai', model: 'mock' }),
        new MockAgent({ id: 'red-2', name: 'Red 2', provider: 'google', model: 'mock' }),
      ];

      agents.forEach((agent) => {
        vi.spyOn(agent, 'generateResponse').mockResolvedValue({
          agentId: agent.id,
          agentName: agent.name,
          position: 'Position',
          reasoning: 'Reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        });
      });

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // Should have 3 responses even with unbalanced teams
      expect(responses).toHaveLength(3);
    });
  });

  describe('error handling', () => {
    it('should handle agent failure gracefully and continue with other agents', async () => {
      const agents = [
        new MockAgent({ id: 'red-1', name: 'Red', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'blue-1', name: 'Blue', provider: 'openai', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockResolvedValue({
        agentId: 'red-1',
        agentName: 'Red',
        position: 'Attack',
        reasoning: 'Reasoning',
        confidence: 0.8,
        timestamp: new Date(),
      });

      vi.spyOn(agents[1], 'generateResponse').mockRejectedValue(new Error('Agent failed'));

      // Should not throw - gracefully handles failure
      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // Should have only the successful response
      expect(responses).toHaveLength(1);
      expect(responses[0]?.agentId).toBe('red-1');
    });

    it('should return empty array if all agents fail', async () => {
      const agents = [
        new MockAgent({ id: 'red-1', name: 'Red', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'blue-1', name: 'Blue', provider: 'openai', model: 'mock' }),
      ];

      vi.spyOn(agents[0], 'generateResponse').mockRejectedValue(new Error('Agent failed'));
      vi.spyOn(agents[1], 'generateResponse').mockRejectedValue(new Error('Agent failed'));

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);
      expect(responses).toHaveLength(0);
    });
  });

  describe('transformContext hook', () => {
    it('should inject team role into context', async () => {
      const receivedContexts: DebateContext[] = [];
      const agents = [
        new MockAgent({ id: 'red-1', name: 'Red', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'blue-1', name: 'Blue', provider: 'openai', model: 'mock' }),
      ];

      agents.forEach((agent) => {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx) => {
          receivedContexts.push({ ...ctx });
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: 'Position',
            reasoning: 'Reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      });

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Red team agent should receive context with _agentTeam: 'red'
      expect((receivedContexts[0] as any)._agentTeam).toBe('red');
      // Blue team agent should receive context with _agentTeam: 'blue'
      expect((receivedContexts[1] as any)._agentTeam).toBe('blue');
    });

    it('should inject team-specific modePrompt via transformContext', async () => {
      const receivedContexts: DebateContext[] = [];
      const agents = [
        new MockAgent({ id: 'red-1', name: 'Red', provider: 'anthropic', model: 'mock' }),
        new MockAgent({ id: 'blue-1', name: 'Blue', provider: 'openai', model: 'mock' }),
      ];

      agents.forEach((agent) => {
        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx) => {
          receivedContexts.push({ ...ctx });
          return {
            agentId: agent.id,
            agentName: agent.name,
            position: 'Position',
            reasoning: 'Reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });
      });

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Red team agent should receive red team prompt
      expect(receivedContexts[0]?.modePrompt?.toLowerCase()).toContain('red team');
      // Blue team agent should receive blue team prompt
      expect(receivedContexts[1]?.modePrompt?.toLowerCase()).toContain('blue team');
    });
  });
});
