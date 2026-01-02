/**
 * Integration tests for persona agent creation in start_roundtable handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleStartRoundtable } from '../../../../src/mcp/handlers/session.js';
import { AgentRegistry } from '../../../../src/agents/registry.js';
import type { DebateEngine } from '../../../../src/core/debate-engine.js';
import type { SessionManager } from '../../../../src/core/session-manager.js';
import type { KeyPointsExtractor } from '../../../../src/core/key-points-extractor.js';

describe('handleStartRoundtable with persona agents', () => {
  const originalEnv = process.env;
  let mockRegistry: AgentRegistry;
  let mockDebateEngine: any;
  let mockSessionManager: any;
  let mockKeyPointsExtractor: any;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ROUNDTABLE_MAX_AGENTS = '5';
    process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT = '4';

    mockRegistry = new AgentRegistry();

    // Register mock provider factory
    mockRegistry.registerProvider(
      'anthropic',
      (config) =>
        ({
          ...config,
          setToolkit: vi.fn(),
          generateResponse: vi.fn().mockResolvedValue({
            agentId: config.id,
            agentName: config.name,
            position: 'Test position',
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          }),
          getInfo: () => config,
        }) as any,
      'claude-sonnet-4-5'
    );

    mockDebateEngine = {
      executeRounds: vi.fn().mockResolvedValue([
        {
          roundNumber: 1,
          responses: [],
          consensus: {
            agreementLevel: 0.5,
            commonGround: [],
            disagreementPoints: [],
            summary: 'Test',
          },
        },
      ]),
    };

    mockSessionManager = {
      createSession: vi.fn().mockResolvedValue({
        id: 'test-session',
        topic: 'Test',
        mode: 'collaborative',
        agentIds: [],
        status: 'active',
        currentRound: 1,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      saveResponses: vi.fn(),
      updateSessionRound: vi.fn(),
    };

    mockKeyPointsExtractor = {
      extractKeyPointsBatch: vi.fn().mockResolvedValue(new Map()),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create persona agents with default count', async () => {
    await handleStartRoundtable(
      { topic: 'Test topic' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    // Should have created 4 agents (default)
    const allAgents = mockRegistry.getAllAgentIds();
    expect(allAgents).toHaveLength(4);
  });

  it('should respect agentCount parameter', async () => {
    await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 2 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const allAgents = mockRegistry.getAllAgentIds();
    expect(allAgents).toHaveLength(2);
  });

  it('should cap agentCount at maxAgents', async () => {
    await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 10 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    // Should be capped at 5 (ROUNDTABLE_MAX_AGENTS)
    const allAgents = mockRegistry.getAllAgentIds();
    expect(allAgents).toHaveLength(5);
  });

  it('should create agents with persona system prompts', async () => {
    await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 2 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const allAgents = mockRegistry.getAllAgentIds();
    const agent1 = mockRegistry.getAgent(allAgents[0]);
    const agent2 = mockRegistry.getAgent(allAgents[1]);

    // Agents should have persona names and system prompts
    expect(agent1?.name).toMatch(/\(.*\)/); // Contains persona in parentheses
    expect(agent1?.systemPrompt).toBeDefined();
    expect(agent1?.systemPrompt).toContain('You are');

    expect(agent2?.name).toMatch(/\(.*\)/);
    expect(agent2?.systemPrompt).toBeDefined();
  });

  it('should use round-robin provider distribution with multiple providers', async () => {
    // Register second provider
    mockRegistry.registerProvider(
      'openai',
      (config) =>
        ({
          ...config,
          setToolkit: vi.fn(),
          generateResponse: vi.fn().mockResolvedValue({
            agentId: config.id,
            agentName: config.name,
            position: 'Test position',
            reasoning: 'Test reasoning',
            confidence: 0.8,
            timestamp: new Date(),
          }),
          getInfo: () => config,
        }) as any,
      'gpt-5.2'
    );

    await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 4 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const allAgents = mockRegistry.getAllAgentIds();
    expect(allAgents).toHaveLength(4);

    // Check round-robin distribution: anthropic, openai, anthropic, openai
    expect(allAgents[0]).toContain('anthropic');
    expect(allAgents[1]).toContain('openai');
    expect(allAgents[2]).toContain('anthropic');
    expect(allAgents[3]).toContain('openai');
  });
});
