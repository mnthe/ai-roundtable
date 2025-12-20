import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelphiMode } from '../../../src/modes/delphi.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext } from '../../../src/types/index.js';
import {
  createAnonymizationProcessor,
  createStatisticsProcessor,
  createProcessorChain,
} from '../../../src/modes/processors/index.js';

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

      expect(prompt).toContain('Delphi Method');
      expect(prompt).toContain('ANONYMOUS INDEPENDENT EXPERT');
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
        focusQuestion: 'Focus on the tech sector specifically',
      };

      const prompt = mode.buildAgentPrompt(contextWithFocus);
      expect(prompt).toContain('FOCUS QUESTION');
      expect(prompt).toContain('Focus on the tech sector');
    });

    it('should not include statistics directly in buildAgentPrompt (statistics come from transformContext)', () => {
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

      // Statistics are now injected via StatisticsProcessor in transformContext,
      // not directly in buildAgentPrompt
      expect(prompt).not.toContain('PREVIOUS ROUND STATISTICS');
      // But should still have the required output structure for subsequent rounds
      expect(prompt).toContain('REQUIRED OUTPUT STRUCTURE');
      expect(prompt).toContain('[RESPONSE TO GROUP]');
    });

    it('should include output structure for subsequent rounds', () => {
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
        ],
      };

      const prompt = mode.buildAgentPrompt(contextWithPrevious);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('[MY POSITION]');
      expect(prompt).toContain('[CONFIDENCE LEVEL]');
      expect(prompt).toContain('[RESPONSE TO GROUP]');
      expect(prompt).toContain('[REASONING & EVIDENCE]');
    });

    it('should encourage independent assessment in first round', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      // Updated to match 4-Layer Framework
      expect(prompt).toContain('[MY POSITION]');
      expect(prompt).toContain('[CONFIDENCE LEVEL]');
      expect(prompt).toContain('[KEY UNCERTAINTIES]');
    });

    it('should include verification checklist', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt).toContain('Before finalizing your response, verify');
      expect(prompt).toContain('If any check fails, revise before submitting');
    });

    it('should emphasize intellectual independence', () => {
      const prompt = mode.buildAgentPrompt(defaultContext);

      expect(prompt).toContain('Honest assessment > Social conformity');
      expect(prompt).toContain('Anonymity protects you');
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

  describe('context processors integration', () => {
    it('should use processor chain for context transformation', () => {
      // Create a context with previous responses
      const contextWithPrevious: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        modePrompt: 'Base mode prompt.',
        previousResponses: [
          {
            agentId: 'claude-1',
            agentName: 'Claude',
            position: 'High impact prediction.',
            reasoning: 'Detailed analysis',
            confidence: 0.8,
            timestamp: new Date(),
          },
          {
            agentId: 'gpt-1',
            agentName: 'ChatGPT',
            position: 'Medium impact prediction.',
            reasoning: 'Alternative analysis',
            confidence: 0.6,
            timestamp: new Date(),
          },
        ],
      };

      // Simulate what transformContext does using the same processor chain
      const processorChain = createProcessorChain([
        createAnonymizationProcessor(),
        createStatisticsProcessor(),
      ]);

      const transformedContext = processorChain.process(contextWithPrevious);

      // Verify anonymization was applied
      expect(transformedContext.previousResponses[0].agentId).toBe('participant-1');
      expect(transformedContext.previousResponses[0].agentName).toBe('Participant 1');
      expect(transformedContext.previousResponses[1].agentId).toBe('participant-2');
      expect(transformedContext.previousResponses[1].agentName).toBe('Participant 2');

      // Verify statistics were injected into modePrompt
      expect(transformedContext.modePrompt).toContain('Round Statistics:');
      expect(transformedContext.modePrompt).toContain('Participants: 2');
      expect(transformedContext.modePrompt).toContain('Average Confidence: 70.0%');
      expect(transformedContext.modePrompt).toContain('Position Distribution:');
    });

    it('should receive transformed context during executeRound', async () => {
      const contextWithPrevious: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses: [
          {
            agentId: 'claude-1',
            agentName: 'Claude',
            position: 'Test position.',
            reasoning: 'Test reasoning',
            confidence: 0.8,
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
          position: 'Response position',
          reasoning: 'Response reasoning',
          confidence: 0.85,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], contextWithPrevious, mockToolkit);

      // Agent should receive context with:
      // 1. Anonymized previous responses
      expect(receivedContext).not.toBeNull();
      expect(receivedContext!.previousResponses[0].agentId).toBe('participant-1');
      expect(receivedContext!.previousResponses[0].agentName).toBe('Participant 1');

      // 2. Statistics injected in modePrompt
      expect(receivedContext!.modePrompt).toContain('Round Statistics:');
      expect(receivedContext!.modePrompt).toContain('Participants: 1');
      expect(receivedContext!.modePrompt).toContain('Average Confidence: 80.0%');
    });

    it('should not transform context when no previous responses', async () => {
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
          position: 'First round position',
          reasoning: 'First round reasoning',
          confidence: 0.75,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(receivedContext).not.toBeNull();
      // No previous responses means no anonymization or statistics injection
      expect(receivedContext!.previousResponses).toHaveLength(0);
      // modePrompt should still be set by buildAgentPrompt but without statistics
      expect(receivedContext!.modePrompt).not.toContain('Round Statistics:');
    });
  });
});
