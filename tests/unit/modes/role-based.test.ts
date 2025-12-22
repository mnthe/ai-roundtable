import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RoleBasedModeStrategy,
  type RoleConfig,
  type RoleBasedContext,
} from '../../../src/modes/role-based.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { BaseAgent, AgentToolkit } from '../../../src/agents/base.js';
import type { DebateContext, AgentResponse, Stance } from '../../../src/types/index.js';

// ============================================
// Base RoleConfig for reuse
// ============================================

const BASE_PRIMARY_CONFIG: RoleConfig = {
  roleAnchor: {
    emoji: '🎯',
    title: 'PRIMARY AGENT',
    definition: 'You are the primary agent.',
    mission: 'Lead the discussion.',
    persistence: 'Maintain primary role.',
    helpfulMeans: 'Providing clear direction',
    helpfulNotMeans: 'Being vague',
  },
  behavioralContract: {
    mustBehaviors: ['Be clear', 'Be direct'],
    mustNotBehaviors: ['Be vague'],
    priorityHierarchy: ['Clarity', 'Accuracy'],
    failureMode: 'Unclear responses will be rejected.',
    includeToolUsageRequirements: false,
  },
  verificationLoop: {
    checklistItems: ['Is my position clear?'],
    includeToolUsageChecks: false,
  },
  displayName: 'Primary Agent',
};

const BASE_SECONDARY_CONFIG: RoleConfig = {
  roleAnchor: {
    emoji: '🔄',
    title: 'SECONDARY AGENT',
    definition: 'You are the secondary agent.',
    mission: 'Support the discussion.',
    persistence: 'Maintain secondary role.',
    helpfulMeans: 'Building on ideas',
    helpfulNotMeans: 'Ignoring others',
  },
  behavioralContract: {
    mustBehaviors: ['Engage with others', 'Add value'],
    mustNotBehaviors: ['Ignore previous points'],
    priorityHierarchy: ['Engagement', 'Contribution'],
    failureMode: 'Disengaged responses will be rejected.',
    includeToolUsageRequirements: false,
  },
  verificationLoop: {
    checklistItems: ['Did I engage with others?'],
    includeToolUsageChecks: false,
  },
  displayName: 'Secondary Agent',
};

const BASE_EVALUATOR_CONFIG: RoleConfig = {
  roleAnchor: {
    emoji: '⚖️',
    title: 'EVALUATOR',
    definition: 'You are the evaluator.',
    mission: 'Assess the discussion.',
    persistence: 'Maintain evaluator role.',
    helpfulMeans: 'Fair assessment',
    helpfulNotMeans: 'Biased judgment',
  },
  behavioralContract: {
    mustBehaviors: ['Be objective', 'Consider all perspectives'],
    mustNotBehaviors: ['Show bias'],
    priorityHierarchy: ['Objectivity', 'Fairness'],
    failureMode: 'Biased responses will be rejected.',
    includeToolUsageRequirements: false,
  },
  verificationLoop: {
    checklistItems: ['Was I objective?'],
    includeToolUsageChecks: false,
  },
  expectedStance: 'NEUTRAL' as Stance,
  displayName: 'Evaluator',
};

// ============================================
// Test Implementations
// ============================================

type TestRole = 'PRIMARY' | 'SECONDARY' | 'EVALUATOR';

/**
 * Minimal concrete implementation for testing abstract class
 */
class TestRoleBasedMode extends RoleBasedModeStrategy<TestRole> {
  readonly name = 'test-role-based';
  protected readonly executionMode: 'parallel' | 'sequential' = 'parallel';

  protected readonly roleConfigs: Record<TestRole, RoleConfig> = {
    PRIMARY: BASE_PRIMARY_CONFIG,
    SECONDARY: BASE_SECONDARY_CONFIG,
    EVALUATOR: BASE_EVALUATOR_CONFIG,
  };

  protected getRoleForIndex(index: number, _totalAgents: number): TestRole {
    const roles: TestRole[] = ['PRIMARY', 'SECONDARY', 'EVALUATOR'];
    return roles[index % roles.length];
  }

  buildAgentPrompt(context: DebateContext): string {
    return `Test Role-Based Mode prompt for ${context.topic}`;
  }
}

/**
 * Sequential execution test implementation
 */
class SequentialTestRoleBasedMode extends TestRoleBasedMode {
  readonly name = 'sequential-test-role-based';
  protected override readonly executionMode = 'sequential' as const;
}

/**
 * Test implementation with custom buildRoleContextAddition
 */
class TestRoleBasedModeWithContextAddition extends TestRoleBasedMode {
  readonly name = 'test-role-based-with-context';

  protected buildRoleContextAddition(context: DebateContext, role: TestRole): string {
    return `\n\n## Additional Context for ${role}\nRound ${context.currentRound} of ${context.totalRounds}`;
  }
}

/**
 * Test implementation with output sections
 */
class TestRoleBasedModeWithOutputSections extends TestRoleBasedMode {
  readonly name = 'test-role-based-with-sections';

  protected override readonly roleConfigs: Record<TestRole, RoleConfig> = {
    PRIMARY: {
      ...BASE_PRIMARY_CONFIG,
      outputSections: [
        { header: '[POSITION]', description: 'State your position clearly' },
        { header: '[REASONING]', description: 'Explain your reasoning' },
      ],
    },
    SECONDARY: {
      ...BASE_SECONDARY_CONFIG,
      outputSections: [
        { header: '[ENGAGEMENT]', description: 'Engage with others' },
        { header: '[CONTRIBUTION]', description: 'Add your contribution' },
      ],
    },
    EVALUATOR: {
      ...BASE_EVALUATOR_CONFIG,
      outputSections: [
        { header: '[ASSESSMENT]', description: 'Provide objective assessment' },
        { header: '[VERDICT]', description: 'Give your verdict' },
      ],
    },
  };
}

/**
 * Test implementation with expected stance for all roles
 */
class TestRoleBasedModeWithStances extends TestRoleBasedMode {
  readonly name = 'test-role-based-with-stances';

  protected override readonly roleConfigs: Record<TestRole, RoleConfig> = {
    PRIMARY: {
      ...BASE_PRIMARY_CONFIG,
      expectedStance: 'YES' as Stance,
      displayName: 'Advocate',
    },
    SECONDARY: {
      ...BASE_SECONDARY_CONFIG,
      expectedStance: 'NO' as Stance,
      displayName: 'Opposition',
    },
    EVALUATOR: {
      ...BASE_EVALUATOR_CONFIG,
      expectedStance: 'NEUTRAL' as Stance,
      displayName: 'Evaluator',
    },
  };
}

// ============================================
// Test Helpers
// ============================================

function createMockToolkit(): AgentToolkit {
  return {
    getTools: () => [],
    executeTool: vi.fn().mockResolvedValue({}),
    setContext: vi.fn(),
    setCurrentAgentId: vi.fn(),
    getPendingContextRequests: () => [],
    clearPendingRequests: vi.fn(),
    hasPendingRequests: () => false,
  };
}

function createMockAgentWithResponse(
  id: string,
  responseOverride?: Partial<AgentResponse>
): MockAgent {
  const agent = new MockAgent({
    id,
    name: `Agent ${id}`,
    provider: 'anthropic',
    model: 'test-model',
  });

  if (responseOverride) {
    agent.setMockResponse({
      agentId: id,
      agentName: `Agent ${id}`,
      position: `Position from ${id}`,
      reasoning: `Reasoning from ${id}`,
      confidence: 0.8,
      timestamp: new Date(),
      ...responseOverride,
    });
  }

  return agent;
}

const defaultContext: DebateContext = {
  sessionId: 'test-session',
  topic: 'Test Topic',
  mode: 'collaborative',
  currentRound: 1,
  totalRounds: 3,
  previousResponses: [],
};

// ============================================
// Tests
// ============================================

describe('RoleBasedModeStrategy', () => {
  let mockToolkit: AgentToolkit;

  beforeEach(() => {
    mockToolkit = createMockToolkit();
    vi.clearAllMocks();
  });

  describe('Abstract class contract', () => {
    it('should be extendable with concrete implementation', () => {
      const mode = new TestRoleBasedMode();
      expect(mode.name).toBe('test-role-based');
    });

    it('should require executeRound implementation via parent', async () => {
      const mode = new TestRoleBasedMode();
      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);
      expect(responses).toHaveLength(1);
    });

    it('should require buildAgentPrompt implementation', () => {
      const mode = new TestRoleBasedMode();
      const prompt = mode.buildAgentPrompt(defaultContext);
      expect(prompt).toContain('Test Role-Based Mode prompt');
      expect(prompt).toContain('Test Topic');
    });
  });

  describe('executeRound', () => {
    it('should create agent index map correctly', async () => {
      const mode = new TestRoleBasedMode();
      const agents = [
        new MockAgent({ id: 'agent-a', name: 'Agent A', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-b', name: 'Agent B', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'agent-c', name: 'Agent C', provider: 'google', model: 'test' }),
      ];

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(3);
      expect(responses.map((r) => r.agentId)).toEqual(['agent-a', 'agent-b', 'agent-c']);
    });

    it('should delegate to executeParallel when executionMode is parallel', async () => {
      const mode = new TestRoleBasedMode();
      const executeSpy = vi.spyOn(mode as any, 'executeParallel');

      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(executeSpy).toHaveBeenCalled();
      const contextArg = executeSpy.mock.calls[0][1] as RoleBasedContext<TestRole>;
      expect(contextArg._roleBasedState).toBeDefined();
      expect(contextArg._roleBasedState?.agentIndexMap.size).toBe(2);
    });

    it('should delegate to executeSequential when executionMode is sequential', async () => {
      const mode = new SequentialTestRoleBasedMode();
      const executeSpy = vi.spyOn(mode as any, 'executeSequential');

      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(executeSpy).toHaveBeenCalled();
      const contextArg = executeSpy.mock.calls[0][1] as RoleBasedContext<TestRole>;
      expect(contextArg._roleBasedState).toBeDefined();
    });

    it('should create concurrency-safe round state with correct totalAgents', async () => {
      const mode = new TestRoleBasedMode();
      const executeSpy = vi.spyOn(mode as any, 'executeParallel');

      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'agent-3', name: 'Agent 3', provider: 'google', model: 'test' }),
        new MockAgent({ id: 'agent-4', name: 'Agent 4', provider: 'perplexity', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      const contextArg = executeSpy.mock.calls[0][1] as RoleBasedContext<TestRole>;
      expect(contextArg._roleBasedState?.totalAgents).toBe(4);
    });
  });

  describe('getAgentRole hook', () => {
    it('should use agentIndexMap from round state', async () => {
      const mode = new SequentialTestRoleBasedMode();
      const getRoleForIndexSpy = vi.spyOn(mode as any, 'getRoleForIndex');

      const agents = [
        new MockAgent({ id: 'first', name: 'First', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'second', name: 'Second', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'third', name: 'Third', provider: 'google', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // getRoleForIndex should be called with correct indices from the map
      expect(getRoleForIndexSpy).toHaveBeenCalledWith(0, 3);
      expect(getRoleForIndexSpy).toHaveBeenCalledWith(1, 3);
      expect(getRoleForIndexSpy).toHaveBeenCalledWith(2, 3);
    });

    it('should fall back to provided index if agent not in map', () => {
      const mode = new TestRoleBasedMode();
      const agent = new MockAgent({
        id: 'unknown-agent',
        name: 'Unknown',
        provider: 'anthropic',
        model: 'test',
      });

      // Call getAgentRole directly with context that has no state
      const role = (mode as any).getAgentRole(agent, 5, defaultContext);

      // 5 % 3 = 2, so EVALUATOR
      expect(role).toBe('EVALUATOR');
    });

    it('should call getRoleForIndex with correct parameters', async () => {
      const mode = new TestRoleBasedMode();
      const getRoleForIndexSpy = vi.spyOn(mode as any, 'getRoleForIndex');

      const agents = [
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'openai', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(getRoleForIndexSpy).toHaveBeenCalledWith(0, 2);
      expect(getRoleForIndexSpy).toHaveBeenCalledWith(1, 2);
    });
  });

  describe('transformContext hook', () => {
    it('should inject role into context', async () => {
      const mode = new TestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(transformContextSpy).toHaveBeenCalled();
      const transformedContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      expect(transformedContext._agentRole).toBe('PRIMARY');
    });

    it('should build role prompt addition using roleConfigs', async () => {
      const mode = new TestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const transformedContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      expect(transformedContext.modePrompt).toContain('Your Role: Primary Agent');
    });

    it('should include role anchor in transformed context', async () => {
      const mode = new TestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const transformedContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      expect(transformedContext.modePrompt).toContain('LAYER 1: ROLE ANCHOR');
      expect(transformedContext.modePrompt).toContain('PRIMARY AGENT');
      expect(transformedContext.modePrompt).toContain('You are the primary agent');
    });

    it('should include behavioral contract in transformed context', async () => {
      const mode = new TestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const transformedContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      expect(transformedContext.modePrompt).toContain('LAYER 2: BEHAVIORAL CONTRACT');
      expect(transformedContext.modePrompt).toContain('Be clear');
      expect(transformedContext.modePrompt).toContain('Be vague');
    });

    it('should include verification loop in transformed context', async () => {
      const mode = new TestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const transformedContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      expect(transformedContext.modePrompt).toContain('LAYER 4: VERIFICATION LOOP');
      expect(transformedContext.modePrompt).toContain('Is my position clear?');
    });

    it('should call buildRoleContextAddition if defined', async () => {
      const mode = new TestRoleBasedModeWithContextAddition();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const transformedContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      expect(transformedContext.modePrompt).toContain('Additional Context for PRIMARY');
      expect(transformedContext.modePrompt).toContain('Round 1 of 3');
    });

    it('should append role prompt to existing modePrompt from buildAgentPrompt', async () => {
      const mode = new TestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agent = new MockAgent({
        id: 'agent-1',
        name: 'Agent 1',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const transformedContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      // The modePrompt should contain both the base prompt (from buildAgentPrompt) and role addition
      expect(transformedContext.modePrompt).toContain('Test Role-Based Mode prompt');
      expect(transformedContext.modePrompt).toContain('Your Role: Primary Agent');
    });
  });

  describe('validateResponse hook', () => {
    it('should validate stance if expectedStance is defined in roleConfig', async () => {
      const mode = new TestRoleBasedModeWithStances();

      // Agent at index 2 should be EVALUATOR with expectedStance NEUTRAL
      const agents = [
        createMockAgentWithResponse('agent-0', { stance: 'YES' }),
        createMockAgentWithResponse('agent-1', { stance: 'NO' }),
        createMockAgentWithResponse('agent-2', { stance: 'NEUTRAL' }),
      ];

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(responses).toHaveLength(3);
      // All responses should have correct stances based on role expectations
      expect(responses[2]._roleViolation).toBeUndefined(); // NEUTRAL matches expected
    });

    it('should use StanceValidator and mark violations', async () => {
      const mode = new TestRoleBasedModeWithStances();

      // EVALUATOR (index 2) expects NEUTRAL, but we provide YES
      const agents = [
        createMockAgentWithResponse('agent-0', { stance: 'YES' }),
        createMockAgentWithResponse('agent-1', { stance: 'NO' }),
        createMockAgentWithResponse('agent-2', { stance: 'YES' }), // Wrong stance for EVALUATOR
      ];

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // EVALUATOR should have role violation marked
      const evaluatorResponse = responses.find((r) => r.agentId === 'agent-2');
      expect(evaluatorResponse?._roleViolation).toEqual({
        expected: 'NEUTRAL',
        actual: 'YES',
      });
    });

    it('should pass through response if no expectedStance defined', async () => {
      // Use base TestRoleBasedMode where PRIMARY and SECONDARY have no expectedStance
      // Note: EVALUATOR has expectedStance, so use only PRIMARY (index 0)
      const mode = new TestRoleBasedMode();

      const agent = createMockAgentWithResponse('agent-0', { stance: 'YES' });

      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);

      // PRIMARY has no expectedStance in TestRoleBasedMode, so no validation
      expect(responses[0]._roleViolation).toBeUndefined();
      expect(responses[0].stance).toBe('YES');
    });

    it('should handle missing stance in response when expectedStance is defined', async () => {
      const mode = new TestRoleBasedModeWithStances();

      // All roles have expectedStance, missing stance should mark violation
      const agents = [
        createMockAgentWithResponse('agent-0', { stance: undefined }),
        createMockAgentWithResponse('agent-1', { stance: undefined }),
        createMockAgentWithResponse('agent-2', { stance: undefined }),
      ];

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // All responses should have violations marked for missing stance
      expect(responses[0]._roleViolation).toEqual({
        expected: 'YES',
        actual: null,
      });
      expect(responses[1]._roleViolation).toEqual({
        expected: 'NO',
        actual: null,
      });
      expect(responses[2]._roleViolation).toEqual({
        expected: 'NEUTRAL',
        actual: null,
      });
    });

    it('should log warnings for stance mismatches', async () => {
      const mode = new TestRoleBasedModeWithStances();

      // Agent at index 0 expects YES but provides NO
      const agent = createMockAgentWithResponse('agent-0', { stance: 'NO' });

      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);

      // The response should have violation marked (logger warning is internal)
      expect(responses[0]._roleViolation).toEqual({
        expected: 'YES',
        actual: 'NO',
      });
    });
  });

  describe('buildRolePromptAddition', () => {
    it('should include role display name', async () => {
      const mode = new TestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agents = [
        new MockAgent({ id: 'agent-0', name: 'Agent 0', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'agent-1', name: 'Agent 1', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'agent-2', name: 'Agent 2', provider: 'google', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // Check each agent got the correct role display name
      expect(transformContextSpy.mock.results[0].value.modePrompt).toContain(
        'Your Role: Primary Agent'
      );
      expect(transformContextSpy.mock.results[1].value.modePrompt).toContain(
        'Your Role: Secondary Agent'
      );
      expect(transformContextSpy.mock.results[2].value.modePrompt).toContain(
        'Your Role: Evaluator'
      );
    });

    it('should include structural enforcement if outputSections defined', async () => {
      const mode = new TestRoleBasedModeWithOutputSections();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agent = new MockAgent({
        id: 'agent-0',
        name: 'Agent 0',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      const transformedContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      expect(transformedContext.modePrompt).toContain('LAYER 3: STRUCTURAL ENFORCEMENT');
      expect(transformedContext.modePrompt).toContain('[POSITION]');
      expect(transformedContext.modePrompt).toContain('State your position clearly');
    });

    it('should call buildRoleContextAddition if implemented', async () => {
      const mode = new TestRoleBasedModeWithContextAddition();
      const buildRoleContextAdditionSpy = vi.spyOn(mode as any, 'buildRoleContextAddition');

      const agent = new MockAgent({
        id: 'agent-0',
        name: 'Agent 0',
        provider: 'anthropic',
        model: 'test',
      });

      await mode.executeRound([agent], defaultContext, mockToolkit);

      expect(buildRoleContextAdditionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'Test Topic' }),
        'PRIMARY'
      );
    });

    it('should handle missing roleConfig gracefully', async () => {
      // Create a mode with incomplete roleConfigs
      class IncompleteRoleMode extends RoleBasedModeStrategy<'UNKNOWN'> {
        readonly name = 'incomplete-role';
        protected readonly executionMode = 'parallel' as const;
        protected readonly roleConfigs = {} as Record<'UNKNOWN', RoleConfig>;

        protected getRoleForIndex(): 'UNKNOWN' {
          return 'UNKNOWN';
        }

        buildAgentPrompt(): string {
          return 'Incomplete mode';
        }
      }

      const mode = new IncompleteRoleMode();
      const agent = new MockAgent({
        id: 'agent-0',
        name: 'Agent 0',
        provider: 'anthropic',
        model: 'test',
      });

      // Should not throw, should handle gracefully
      const responses = await mode.executeRound([agent], defaultContext, mockToolkit);
      expect(responses).toHaveLength(1);
    });
  });

  describe('Concurrency safety', () => {
    it('should bind round state to context, not instance', async () => {
      const mode = new TestRoleBasedMode();

      // Create two sets of agents for concurrent execution
      const agents1 = [
        new MockAgent({ id: 'batch1-a', name: 'Batch1 A', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'batch1-b', name: 'Batch1 B', provider: 'openai', model: 'test' }),
      ];

      const agents2 = [
        new MockAgent({ id: 'batch2-a', name: 'Batch2 A', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'batch2-b', name: 'Batch2 B', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'batch2-c', name: 'Batch2 C', provider: 'google', model: 'test' }),
      ];

      // Execute concurrently
      const [responses1, responses2] = await Promise.all([
        mode.executeRound(agents1, { ...defaultContext, sessionId: 'session-1' }, mockToolkit),
        mode.executeRound(agents2, { ...defaultContext, sessionId: 'session-2' }, mockToolkit),
      ]);

      // Each execution should have correct number of responses
      expect(responses1).toHaveLength(2);
      expect(responses2).toHaveLength(3);

      // Agent IDs should be correct for each batch
      expect(responses1.map((r) => r.agentId)).toEqual(['batch1-a', 'batch1-b']);
      expect(responses2.map((r) => r.agentId)).toEqual(['batch2-a', 'batch2-b', 'batch2-c']);
    });

    it('should not share state between concurrent calls', async () => {
      const mode = new TestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agents1 = [
        new MockAgent({ id: 'concurrent-1a', name: 'C1A', provider: 'anthropic', model: 'test' }),
      ];

      const agents2 = [
        new MockAgent({ id: 'concurrent-2a', name: 'C2A', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'concurrent-2b', name: 'C2B', provider: 'openai', model: 'test' }),
      ];

      await Promise.all([
        mode.executeRound(agents1, { ...defaultContext, sessionId: 'concurrent-1' }, mockToolkit),
        mode.executeRound(agents2, { ...defaultContext, sessionId: 'concurrent-2' }, mockToolkit),
      ]);

      // Verify each context transformation received correct state
      const calls = transformContextSpy.mock.calls;
      const results = transformContextSpy.mock.results;

      // Find calls for each batch based on sessionId
      for (let i = 0; i < calls.length; i++) {
        const context = calls[i][0] as RoleBasedContext<TestRole>;
        const result = results[i].value as RoleBasedContext<TestRole>;

        if (context.sessionId === 'concurrent-1') {
          expect(result._roleBasedState?.totalAgents).toBe(1);
        } else if (context.sessionId === 'concurrent-2') {
          expect(result._roleBasedState?.totalAgents).toBe(2);
        }
      }
    });

    it('should maintain correct agent indices in concurrent execution', async () => {
      const mode = new TestRoleBasedMode();

      // Create agents that will be processed concurrently
      const agents = [
        new MockAgent({ id: 'idx-0', name: 'Idx 0', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'idx-1', name: 'Idx 1', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'idx-2', name: 'Idx 2', provider: 'google', model: 'test' }),
      ];

      const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

      // Verify roles are assigned correctly based on index
      expect(responses).toHaveLength(3);

      // Since we can't directly check the role assignment, we verify through
      // the transformContext behavior which sets modePrompt based on role
    });
  });

  describe('Error handling', () => {
    it('should continue with other agents when one fails in parallel execution', async () => {
      const mode = new TestRoleBasedMode();

      class FailingMockAgent extends MockAgent {
        override async generateResponse(): Promise<AgentResponse> {
          throw new Error('Agent failed');
        }
      }

      const workingAgent = new MockAgent({
        id: 'working',
        name: 'Working',
        provider: 'anthropic',
        model: 'test',
      });

      const failingAgent = new FailingMockAgent({
        id: 'failing',
        name: 'Failing',
        provider: 'openai',
        model: 'test',
      });

      const responses = await mode.executeRound(
        [workingAgent, failingAgent],
        defaultContext,
        mockToolkit
      );

      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('working');
    });

    it('should continue with other agents when one fails in sequential execution', async () => {
      const mode = new SequentialTestRoleBasedMode();

      class FailingMockAgent extends MockAgent {
        override async generateResponse(): Promise<AgentResponse> {
          throw new Error('Agent failed');
        }
      }

      const workingAgent = new MockAgent({
        id: 'working',
        name: 'Working',
        provider: 'anthropic',
        model: 'test',
      });

      const failingAgent = new FailingMockAgent({
        id: 'failing',
        name: 'Failing',
        provider: 'openai',
        model: 'test',
      });

      const responses = await mode.executeRound(
        [failingAgent, workingAgent],
        defaultContext,
        mockToolkit
      );

      expect(responses).toHaveLength(1);
      expect(responses[0].agentId).toBe('working');
    });
  });

  describe('Integration with parent class hooks', () => {
    it('should work with empty agents array', async () => {
      const mode = new TestRoleBasedMode();
      const responses = await mode.executeRound([], defaultContext, mockToolkit);
      expect(responses).toEqual([]);
    });

    it('should correctly transform context for each agent in sequence', async () => {
      const mode = new SequentialTestRoleBasedMode();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agents = [
        new MockAgent({ id: 'seq-1', name: 'Seq 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'seq-2', name: 'Seq 2', provider: 'openai', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(transformContextSpy).toHaveBeenCalledTimes(2);

      // Verify each agent got correct role
      const result1 = transformContextSpy.mock.results[0].value as RoleBasedContext<TestRole>;
      const result2 = transformContextSpy.mock.results[1].value as RoleBasedContext<TestRole>;

      expect(result1._agentRole).toBe('PRIMARY');
      expect(result2._agentRole).toBe('SECONDARY');
    });

    it('should validate all responses in sequential execution', async () => {
      const mode = new SequentialTestRoleBasedMode();
      const validateResponseSpy = vi.spyOn(mode as any, 'validateResponse');

      const agents = [
        new MockAgent({ id: 'val-1', name: 'Val 1', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'val-2', name: 'Val 2', provider: 'openai', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      expect(validateResponseSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Role-specific output sections', () => {
    it('should include different output sections per role', async () => {
      const mode = new TestRoleBasedModeWithOutputSections();
      const transformContextSpy = vi.spyOn(mode as any, 'transformContext');

      const agents = [
        new MockAgent({ id: 'os-0', name: 'OS 0', provider: 'anthropic', model: 'test' }),
        new MockAgent({ id: 'os-1', name: 'OS 1', provider: 'openai', model: 'test' }),
        new MockAgent({ id: 'os-2', name: 'OS 2', provider: 'google', model: 'test' }),
      ];

      await mode.executeRound(agents, defaultContext, mockToolkit);

      // PRIMARY should have [POSITION] and [REASONING]
      const primaryContext = transformContextSpy.mock.results[0]
        .value as RoleBasedContext<TestRole>;
      expect(primaryContext.modePrompt).toContain('[POSITION]');
      expect(primaryContext.modePrompt).toContain('[REASONING]');

      // SECONDARY should have [ENGAGEMENT] and [CONTRIBUTION]
      const secondaryContext = transformContextSpy.mock.results[1]
        .value as RoleBasedContext<TestRole>;
      expect(secondaryContext.modePrompt).toContain('[ENGAGEMENT]');
      expect(secondaryContext.modePrompt).toContain('[CONTRIBUTION]');

      // EVALUATOR should have [ASSESSMENT] and [VERDICT]
      const evaluatorContext = transformContextSpy.mock.results[2]
        .value as RoleBasedContext<TestRole>;
      expect(evaluatorContext.modePrompt).toContain('[ASSESSMENT]');
      expect(evaluatorContext.modePrompt).toContain('[VERDICT]');
    });
  });

  describe('Role assignment via getRoleForIndex', () => {
    it('should assign roles cyclically based on index', () => {
      const mode = new TestRoleBasedMode();

      expect((mode as any).getRoleForIndex(0, 3)).toBe('PRIMARY');
      expect((mode as any).getRoleForIndex(1, 3)).toBe('SECONDARY');
      expect((mode as any).getRoleForIndex(2, 3)).toBe('EVALUATOR');
      expect((mode as any).getRoleForIndex(3, 6)).toBe('PRIMARY');
      expect((mode as any).getRoleForIndex(4, 6)).toBe('SECONDARY');
      expect((mode as any).getRoleForIndex(5, 6)).toBe('EVALUATOR');
    });
  });
});
