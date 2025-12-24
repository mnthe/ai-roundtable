import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ExpertPanelMode,
  PERSPECTIVE_ANCHORS,
  PERSPECTIVE_DESCRIPTIONS,
  type Perspective,
} from '../../../src/modes/expert-panel.js';
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
      getPendingContextRequests: () => [],
      clearPendingRequests: vi.fn(),
      hasPendingRequests: () => false,
    };
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(mode.name).toBe('expert-panel');
    });
  });

  describe('perspective anchors exports', () => {
    it('should export PERSPECTIVE_ANCHORS array', () => {
      expect(PERSPECTIVE_ANCHORS).toEqual(['technical', 'economic', 'ethical', 'social']);
    });

    it('should export PERSPECTIVE_DESCRIPTIONS for all perspectives', () => {
      expect(PERSPECTIVE_DESCRIPTIONS.technical).toContain('technical feasibility');
      expect(PERSPECTIVE_DESCRIPTIONS.economic).toContain('costs');
      expect(PERSPECTIVE_DESCRIPTIONS.ethical).toContain('moral implications');
      expect(PERSPECTIVE_DESCRIPTIONS.social).toContain('user impact');
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
        reasoning: "Shor's algorithm for factoring",
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

  describe('perspective assignment', () => {
    it('should assign perspectives to agents using round-robin', async () => {
      const receivedContexts: DebateContext[] = [];

      const createCapturingAgent = (id: string) => {
        const agent = new MockAgent({
          id,
          name: `Expert ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          receivedContexts.push(ctx);
          return {
            agentId: id,
            agentName: `Expert ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      const agents = [
        createCapturingAgent('agent-0'),
        createCapturingAgent('agent-1'),
        createCapturingAgent('agent-2'),
        createCapturingAgent('agent-3'),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Each agent should receive a context with modePrompt containing their perspective
      expect(receivedContexts[0].modePrompt).toContain('Technical');
      expect(receivedContexts[1].modePrompt).toContain('Economic');
      expect(receivedContexts[2].modePrompt).toContain('Ethical');
      expect(receivedContexts[3].modePrompt).toContain('Social');
    });

    it('should wrap around perspectives for more than 4 agents', async () => {
      const receivedContexts: DebateContext[] = [];

      const createCapturingAgent = (id: string) => {
        const agent = new MockAgent({
          id,
          name: `Expert ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          receivedContexts.push(ctx);
          return {
            agentId: id,
            agentName: `Expert ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      const agents = [
        createCapturingAgent('agent-0'),
        createCapturingAgent('agent-1'),
        createCapturingAgent('agent-2'),
        createCapturingAgent('agent-3'),
        createCapturingAgent('agent-4'), // Should wrap to technical
        createCapturingAgent('agent-5'), // Should wrap to economic
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Fifth agent should get technical (wraps around)
      expect(receivedContexts[4].modePrompt).toContain('Technical');
      // Sixth agent should get economic (wraps around)
      expect(receivedContexts[5].modePrompt).toContain('Economic');
    });

    it('should reset perspective assignments between rounds', async () => {
      const firstRoundContexts: DebateContext[] = [];
      const secondRoundContexts: DebateContext[] = [];

      const createCapturingAgent = (id: string, roundContexts: DebateContext[]) => {
        const agent = new MockAgent({
          id,
          name: `Expert ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          roundContexts.push(ctx);
          return {
            agentId: id,
            agentName: `Expert ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      // First round
      const firstRoundAgents = [
        createCapturingAgent('agent-0', firstRoundContexts),
        createCapturingAgent('agent-1', firstRoundContexts),
      ];
      await mode.executeRound(firstRoundAgents, defaultContext, mockToolkit);

      // Second round with same mode instance
      const secondRoundAgents = [
        createCapturingAgent('agent-0-r2', secondRoundContexts),
        createCapturingAgent('agent-1-r2', secondRoundContexts),
      ];
      await mode.executeRound(secondRoundAgents, defaultContext, mockToolkit);

      // Both rounds should start from technical (index 0)
      expect(firstRoundContexts[0].modePrompt).toContain('Technical');
      expect(secondRoundContexts[0].modePrompt).toContain('Technical');
    });
  });

  describe('concurrency safety', () => {
    it('should isolate state between concurrent executeRound calls', async () => {
      // Create two sets of agents for concurrent sessions
      const session1Contexts: DebateContext[] = [];
      const session2Contexts: DebateContext[] = [];

      const createCapturingAgent = (id: string, targetContexts: DebateContext[], delay: number) => {
        const agent = new MockAgent({
          id,
          name: `Agent ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          // Delay to simulate real processing time
          await new Promise((resolve) => setTimeout(resolve, delay));
          targetContexts.push(ctx);
          return {
            agentId: id,
            agentName: `Agent ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      // Session 1: 2 agents, technical and economic perspectives
      const session1Agents = [
        createCapturingAgent('s1-agent-0', session1Contexts, 50),
        createCapturingAgent('s1-agent-1', session1Contexts, 50),
      ];

      // Session 2: 3 agents, technical, economic, and ethical perspectives
      const session2Agents = [
        createCapturingAgent('s2-agent-0', session2Contexts, 30),
        createCapturingAgent('s2-agent-1', session2Contexts, 30),
        createCapturingAgent('s2-agent-2', session2Contexts, 30),
      ];

      // Execute both rounds concurrently using the same mode instance
      await Promise.all([
        mode.executeRound(
          session1Agents,
          { ...defaultContext, sessionId: 'session-1' },
          mockToolkit
        ),
        mode.executeRound(
          session2Agents,
          { ...defaultContext, sessionId: 'session-2' },
          mockToolkit
        ),
      ]);

      // Session 1 should have perspectives: technical, economic (2 agents)
      expect(session1Contexts).toHaveLength(2);
      expect(session1Contexts[0].modePrompt).toContain('Technical');
      expect(session1Contexts[1].modePrompt).toContain('Economic');

      // Session 2 should have perspectives: technical, economic, ethical (3 agents)
      expect(session2Contexts).toHaveLength(3);
      expect(session2Contexts[0].modePrompt).toContain('Technical');
      expect(session2Contexts[1].modePrompt).toContain('Economic');
      expect(session2Contexts[2].modePrompt).toContain('Ethical');
    });

    it('should not share perspective map between concurrent sessions', async () => {
      const session1Perspectives: (string | undefined)[] = [];
      const session2Perspectives: (string | undefined)[] = [];

      const createCapturingAgent = (
        id: string,
        targetPerspectives: (string | undefined)[],
        delay: number
      ) => {
        const agent = new MockAgent({
          id,
          name: `Agent ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          // Extract perspective from modePrompt - new format uses **Technical perspective**
          const perspectiveMatch = ctx.modePrompt?.match(
            /analyzing from: \*\*(\w+) perspective\*\*/i
          );
          targetPerspectives.push(perspectiveMatch?.[1]);
          return {
            agentId: id,
            agentName: `Agent ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      // Run multiple times to check for race conditions
      for (let i = 0; i < 3; i++) {
        session1Perspectives.length = 0;
        session2Perspectives.length = 0;

        const session1Agents = [
          createCapturingAgent(`s1-a0-${i}`, session1Perspectives, 20),
          createCapturingAgent(`s1-a1-${i}`, session1Perspectives, 20),
        ];

        const session2Agents = [
          createCapturingAgent(`s2-a0-${i}`, session2Perspectives, 10),
          createCapturingAgent(`s2-a1-${i}`, session2Perspectives, 10),
          createCapturingAgent(`s2-a2-${i}`, session2Perspectives, 10),
        ];

        await Promise.all([
          mode.executeRound(session1Agents, defaultContext, mockToolkit),
          mode.executeRound(session2Agents, defaultContext, mockToolkit),
        ]);

        // Both sessions should always start with Technical (index 0)
        expect(session1Perspectives[0]).toBe('Technical');
        expect(session2Perspectives[0]).toBe('Technical');
      }
    });
  });

  describe('perspective-specific prompts', () => {
    it('should include perspective assignment in prompt', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // New format: perspective assigned in transformContext hook
      expect(receivedContext[0].modePrompt).toContain('Your Perspective Assignment');
      expect(receivedContext[0].modePrompt).toContain('Technical perspective');
    });

    it('should include perspective-specific analysis guidance', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // New format: analyzing from guidance
      expect(receivedContext[0].modePrompt).toContain('analyzing from:');
      expect(receivedContext[0].modePrompt).toContain('Technical perspective');
    });

    it('should include perspective-specific verification checklist item', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // New format: perspective name capitalized
      expect(receivedContext[0].modePrompt).toContain(
        'Did I analyze primarily from the Technical perspective'
      );
    });

    it('should include perspective description in MUST behaviors', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // Should include the perspective description
      expect(receivedContext[0].modePrompt).toContain(PERSPECTIVE_DESCRIPTIONS.technical);
    });

    it('should use unified role anchor with perspective differentiation', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      // New design: unified role anchor + perspective assignment section
      expect(receivedContext[0].modePrompt).toContain('INDEPENDENT DOMAIN EXPERT');
      expect(receivedContext[0].modePrompt).toContain('Your Perspective Assignment');
      expect(receivedContext[0].modePrompt).toContain('Technical perspective');
    });

    it('should differentiate perspectives through assignment section', async () => {
      const receivedContexts: DebateContext[] = [];

      const createCapturingAgent = (id: string) => {
        const agent = new MockAgent({
          id,
          name: `Expert ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          receivedContexts.push(ctx);
          return {
            agentId: id,
            agentName: `Expert ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      const agents = [
        createCapturingAgent('agent-0'),
        createCapturingAgent('agent-1'),
        createCapturingAgent('agent-2'),
        createCapturingAgent('agent-3'),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // All agents share base role anchor
      receivedContexts.forEach((ctx) => {
        expect(ctx.modePrompt).toContain('INDEPENDENT DOMAIN EXPERT');
      });

      // But each has unique perspective assignment
      expect(receivedContexts[0].modePrompt).toContain('Technical perspective');
      expect(receivedContexts[1].modePrompt).toContain('Economic perspective');
      expect(receivedContexts[2].modePrompt).toContain('Ethical perspective');
      expect(receivedContexts[3].modePrompt).toContain('Social perspective');
    });
  });

  describe('custom perspectives via context.perspectives', () => {
    it('should use custom perspectives when provided in context', async () => {
      const receivedContexts: DebateContext[] = [];

      const createCapturingAgent = (id: string) => {
        const agent = new MockAgent({
          id,
          name: `Expert ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          receivedContexts.push(ctx);
          return {
            agentId: id,
            agentName: `Expert ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      const contextWithCustomPerspectives: DebateContext = {
        ...defaultContext,
        perspectives: [
          {
            name: 'Security Analysis',
            description: 'Focus on security vulnerabilities and threats',
            focusAreas: ['Threat modeling', 'Risk assessment'],
            evidenceTypes: ['CVE reports', 'Penetration test results'],
            keyQuestions: ['What attack vectors exist?'],
            antiPatterns: ['Ignoring edge cases'],
          },
          {
            name: 'Performance Analysis',
            description: 'Focus on system performance',
            focusAreas: ['Latency', 'Throughput'],
            evidenceTypes: ['Benchmarks', 'Load tests'],
            keyQuestions: ['What are the bottlenecks?'],
            antiPatterns: ['Premature optimization'],
          },
        ],
      };

      const agents = [createCapturingAgent('agent-0'), createCapturingAgent('agent-1')];

      await mode.executeRound(agents, contextWithCustomPerspectives, mockToolkit);

      // Verify custom perspectives are used instead of defaults
      expect(receivedContexts[0].modePrompt).toContain('Security Analysis');
      expect(receivedContexts[0].modePrompt).toContain('security vulnerabilities');
      expect(receivedContexts[1].modePrompt).toContain('Performance Analysis');
      expect(receivedContexts[1].modePrompt).toContain('system performance');
    });

    it('should include focus areas in custom perspective prompts', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const contextWithPerspective: DebateContext = {
        ...defaultContext,
        perspectives: [
          {
            name: 'Custom Perspective',
            description: 'Custom description',
            focusAreas: ['Focus Area 1', 'Focus Area 2', 'Focus Area 3'],
            evidenceTypes: ['Evidence Type 1'],
            keyQuestions: ['Key Question 1?'],
            antiPatterns: ['Anti Pattern 1'],
          },
        ],
      };

      await mode.executeRound([agent], contextWithPerspective, mockToolkit);

      expect(receivedContext[0].modePrompt).toContain('Focus Area 1');
      expect(receivedContext[0].modePrompt).toContain('Focus Area 2');
    });

    it('should include evidence types in custom perspective prompts', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const contextWithPerspective: DebateContext = {
        ...defaultContext,
        perspectives: [
          {
            name: 'Custom Perspective',
            description: 'Custom description',
            focusAreas: ['Focus'],
            evidenceTypes: ['Research papers', 'Statistical data', 'Case studies'],
            keyQuestions: [],
            antiPatterns: [],
          },
        ],
      };

      await mode.executeRound([agent], contextWithPerspective, mockToolkit);

      expect(receivedContext[0].modePrompt).toContain('Research papers');
      expect(receivedContext[0].modePrompt).toContain('Statistical data');
    });

    it('should include anti-patterns in custom perspective prompts', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const contextWithPerspective: DebateContext = {
        ...defaultContext,
        perspectives: [
          {
            name: 'Custom Perspective',
            description: 'Custom description',
            focusAreas: [],
            evidenceTypes: [],
            keyQuestions: [],
            antiPatterns: ['Making assumptions without data', 'Ignoring edge cases'],
          },
        ],
      };

      await mode.executeRound([agent], contextWithPerspective, mockToolkit);

      expect(receivedContext[0].modePrompt).toContain('Making assumptions without data');
      expect(receivedContext[0].modePrompt).toContain('Ignoring edge cases');
    });

    it('should show other perspectives in differentiation prompt', async () => {
      const receivedContexts: DebateContext[] = [];

      const createCapturingAgent = (id: string) => {
        const agent = new MockAgent({
          id,
          name: `Expert ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          receivedContexts.push(ctx);
          return {
            agentId: id,
            agentName: `Expert ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      const contextWithPerspectives: DebateContext = {
        ...defaultContext,
        perspectives: [
          {
            name: 'Security',
            description: 'Security focus',
            focusAreas: [],
            evidenceTypes: [],
            keyQuestions: [],
            antiPatterns: [],
          },
          {
            name: 'Performance',
            description: 'Performance focus',
            focusAreas: [],
            evidenceTypes: [],
            keyQuestions: [],
            antiPatterns: [],
          },
          {
            name: 'Usability',
            description: 'Usability focus',
            focusAreas: [],
            evidenceTypes: [],
            keyQuestions: [],
            antiPatterns: [],
          },
        ],
      };

      const agents = [
        createCapturingAgent('agent-0'),
        createCapturingAgent('agent-1'),
        createCapturingAgent('agent-2'),
      ];

      await mode.executeRound(agents, contextWithPerspectives, mockToolkit);

      // Agent with Security perspective should see Performance and Usability as other perspectives
      expect(receivedContexts[0].modePrompt).toContain('Security');
      expect(receivedContexts[0].modePrompt).toContain('Other panelists cover');
      expect(receivedContexts[0].modePrompt).toContain('Performance');
      expect(receivedContexts[0].modePrompt).toContain('Usability');
    });

    it('should use round-robin for custom perspectives with more agents than perspectives', async () => {
      const receivedContexts: DebateContext[] = [];

      const createCapturingAgent = (id: string) => {
        const agent = new MockAgent({
          id,
          name: `Expert ${id}`,
          provider: 'anthropic',
          model: 'mock',
        });

        vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
          receivedContexts.push(ctx);
          return {
            agentId: id,
            agentName: `Expert ${id}`,
            position: `Position from ${id}`,
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          };
        });

        return agent;
      };

      const contextWithPerspectives: DebateContext = {
        ...defaultContext,
        perspectives: [
          {
            name: 'Alpha',
            description: 'Alpha perspective',
            focusAreas: [],
            evidenceTypes: [],
            keyQuestions: [],
            antiPatterns: [],
          },
          {
            name: 'Beta',
            description: 'Beta perspective',
            focusAreas: [],
            evidenceTypes: [],
            keyQuestions: [],
            antiPatterns: [],
          },
        ],
      };

      // 4 agents but only 2 perspectives - should wrap around
      const agents = [
        createCapturingAgent('agent-0'),
        createCapturingAgent('agent-1'),
        createCapturingAgent('agent-2'),
        createCapturingAgent('agent-3'),
      ];

      await mode.executeRound(agents, contextWithPerspectives, mockToolkit);

      expect(receivedContexts[0].modePrompt).toContain('Alpha');
      expect(receivedContexts[1].modePrompt).toContain('Beta');
      expect(receivedContexts[2].modePrompt).toContain('Alpha'); // Wraps around
      expect(receivedContexts[3].modePrompt).toContain('Beta'); // Wraps around
    });
  });

  describe('round-based behavior with custom perspectives', () => {
    it('should use first round sections for round 1', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const contextRound1: DebateContext = {
        ...defaultContext,
        currentRound: 1,
        perspectives: [
          {
            name: 'Test Perspective',
            description: 'Test',
            focusAreas: ['Focus 1'],
            evidenceTypes: [],
            keyQuestions: ['Question 1?'],
            antiPatterns: [],
          },
        ],
      };

      await mode.executeRound([agent], contextRound1, mockToolkit);

      // First round should include establishing position prompt
      expect(receivedContext[0].modePrompt).toContain('Round 1');
      expect(receivedContext[0].modePrompt).toContain('Establishing Position');
      expect(receivedContext[0].modePrompt).toContain('Other experts have NOT yet spoken');
    });

    it('should use synthesis sections for subsequent rounds', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const contextRound2: DebateContext = {
        ...defaultContext,
        currentRound: 2,
        previousResponses: [
          {
            agentId: 'other',
            agentName: 'Other',
            position: 'Other position',
            reasoning: 'Other reasoning',
            confidence: 0.7,
            timestamp: new Date(),
          },
        ],
        perspectives: [
          {
            name: 'Test Perspective',
            description: 'Test',
            focusAreas: ['Focus 1'],
            evidenceTypes: [],
            keyQuestions: [],
            antiPatterns: [],
          },
        ],
      };

      await mode.executeRound([agent], contextRound2, mockToolkit);

      // Subsequent rounds should include synthesis prompt
      expect(receivedContext[0].modePrompt).toContain('Round 2');
      expect(receivedContext[0].modePrompt).toContain('Synthesis Mode');
      expect(receivedContext[0].modePrompt).toContain('You have seen other perspectives');
    });

    it('should include key questions in first round prompt', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const context: DebateContext = {
        ...defaultContext,
        currentRound: 1,
        perspectives: [
          {
            name: 'Test Perspective',
            description: 'Test',
            focusAreas: [],
            evidenceTypes: [],
            keyQuestions: ['What is the scalability impact?', 'How does it affect security?'],
            antiPatterns: [],
          },
        ],
      };

      await mode.executeRound([agent], context, mockToolkit);

      expect(receivedContext[0].modePrompt).toContain('What is the scalability impact?');
      expect(receivedContext[0].modePrompt).toContain('How does it affect security?');
    });
  });

  describe('enhanced verification with custom perspectives', () => {
    it('should include perspective-specific verification checklist', async () => {
      const receivedContext: DebateContext[] = [];

      const agent = new MockAgent({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'mock',
      });

      vi.spyOn(agent, 'generateResponse').mockImplementation(async (ctx: DebateContext) => {
        receivedContext.push(ctx);
        return {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        };
      });

      const context: DebateContext = {
        ...defaultContext,
        perspectives: [
          {
            name: 'Security Analysis',
            description: 'Security focus',
            focusAreas: ['Threat modeling'],
            evidenceTypes: [],
            keyQuestions: [],
            antiPatterns: [],
          },
        ],
      };

      await mode.executeRound([agent], context, mockToolkit);

      // Should include perspective-specific verification
      expect(receivedContext[0].modePrompt).toContain('Did I analyze primarily from the');
      expect(receivedContext[0].modePrompt).toContain('Security Analysis');
      expect(receivedContext[0].modePrompt).toContain('UNIQUE INSIGHT');
      expect(receivedContext[0].modePrompt).toContain('BLIND SPOTS');
    });
  });
});
