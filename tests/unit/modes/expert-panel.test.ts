import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpertPanelMode } from '../../../src/modes/expert-panel.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext, AgentResponse } from '../../../src/types/index.js';

describe('ExpertPanelMode', () => {
  let mode: ExpertPanelMode;
  let mockToolkit: AgentToolkit;

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'What are the implications of quantum computing?',
    mode: 'expert-panel',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  beforeEach(() => {
    mode = new ExpertPanelMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
      setContext: vi.fn(),
    };
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(mode.name).toBe('expert-panel');
    });
  });

  describe('executeRound', () => {
    it('should return empty array for no agents', async () => {
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should execute all agents in parallel', async () => {
      const startTimes: number[] = [];
      const endTimes: number[] = [];

      const createDelayedAgent = (id: string, delay: number) => {
        const agent = new MockAgent({
          id,
          name: `Expert ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
          startTimes.push(Date.now());
          await new Promise((resolve) => setTimeout(resolve, delay));
          endTimes.push(Date.now());
          return {
            agentId: id,
            agentName: `Expert ${id}`,
            position: `Expert opinion from ${id}`,
            reasoning: 'Professional analysis',
            confidence: 0.85,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      const agent1 = createDelayedAgent('expert-1', 50);
      const agent2 = createDelayedAgent('expert-2', 50);
      const agent3 = createDelayedAgent('expert-3', 50);

      const responses = await mode.executeRound(
        [agent1, agent2, agent3],
        defaultContext,
        mockToolkit
      );

      expect(responses).toHaveLength(3);

      // All agents should start at roughly the same time (parallel execution)
      const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes);
      expect(maxStartDiff).toBeLessThan(30); // All started within 30ms of each other
    });

    it('should collect responses from all experts', async () => {
      const agent1 = new MockAgent({
        id: 'physics-expert',
        name: 'Physics Expert',
        provider: 'anthropic',
        model: 'mock',
      });
      const agent2 = new MockAgent({
        id: 'cs-expert',
        name: 'CS Expert',
        provider: 'openai',
        model: 'mock',
      });

      vi.spyOn(agent1, 'generateResponse').mockResolvedValue({
        agentId: 'physics-expert',
        agentName: 'Physics Expert',
        position: 'Quantum computing leverages quantum mechanics',
        reasoning: 'Based on superposition and entanglement',
        confidence: 0.9,
        timestamp: new Date(),
      });

      vi.spyOn(agent2, 'generateResponse').mockResolvedValue({
        agentId: 'cs-expert',
        agentName: 'CS Expert',
        position: 'Quantum algorithms can solve certain problems faster',
        reasoning: 'Shor\'s algorithm for factoring',
        confidence: 0.85,
        timestamp: new Date(),
      });

      const responses = await mode.executeRound([agent1, agent2], defaultContext, mockToolkit);

      expect(responses).toHaveLength(2);
      expect(responses.map((r) => r.agentName)).toContain('Physics Expert');
      expect(responses.map((r) => r.agentName)).toContain('CS Expert');
    });

    it('should set toolkit on each agent', async () => {
      const agent = new MockAgent({
        id: 'expert-1',
        name: 'Expert 1',
        provider: 'anthropic',
        model: 'mock',
      });

      const setToolkitSpy = vi.spyOn(agent, 'setToolkit');

      await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(setToolkitSpy).toHaveBeenCalledWith(mockToolkit);
    });
  });

  describe('buildAgentPrompt', () => {
    it('should include expert panel instructions', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt).toContain('Expert Panel');
      expect(prompt).toContain('INDEPENDENT DOMAIN EXPERT');
      expect(prompt).toContain('evidence-based');
    });

    it('should include 4-layer structure', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      // Verify all 4 layers are present
      expect(prompt).toContain('LAYER 1: ROLE ANCHOR');
      expect(prompt).toContain('LAYER 2: BEHAVIORAL CONTRACT');
      expect(prompt).toContain('LAYER 3: STRUCTURAL ENFORCEMENT');
      expect(prompt).toContain('LAYER 4: VERIFICATION LOOP');
    });

    it('should include MUST and MUST NOT behaviors', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt).toContain('MUST (Required Behaviors)');
      expect(prompt).toContain('MUST NOT (Prohibited Behaviors)');
      expect(prompt).toContain('PRIORITY HIERARCHY');
      expect(prompt).toContain('FAILURE MODE');
    });

    it('should include focus question when provided', () => {
      const contextWithFocus: DebateContext = {
        ...defaultContext,
        focusQuestion: 'When will quantum supremacy be practical?',
      };

      const prompt = mode.buildAgentPrompt(contextWithFocus);

      expect(prompt).toContain('FOCUS QUESTION');
      expect(prompt).toContain('When will quantum supremacy be practical?');
    });

    it('should include review guidance when previous responses exist', () => {
      const contextWithPrevious: DebateContext = {
        ...defaultContext,
        previousResponses: [
          {
            agentId: 'other-expert',
            agentName: 'Other Expert',
            position: 'Initial expert opinion',
            reasoning: 'Based on research',
            confidence: 0.8,
            timestamp: new Date(),
          },
        ],
      };

      const prompt = mode.buildAgentPrompt(contextWithPrevious);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('[EXPERT ASSESSMENT]');
      expect(prompt).toContain('[AREAS OF CONSENSUS]');
      expect(prompt).toContain('[POINTS OF DIVERGENCE]');
      expect(prompt).toContain('[CONFIDENCE & LIMITATIONS]');
    });

    it('should include initial assessment guidance for first round', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('[ANALYTICAL FRAMEWORK]');
      expect(prompt).toContain('[KEY FINDINGS]');
      expect(prompt).toContain('[SUPPORTING EVIDENCE]');
      expect(prompt).toContain('[OPEN QUESTIONS]');
    });

    it('should include verification checklist', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt).toContain('Before finalizing your response, verify');
      expect(prompt).toContain('If any check fails, revise before submitting');
    });
  });
});
