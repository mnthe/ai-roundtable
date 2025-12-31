/**
 * Tests for MCP session handlers
 * Handles: start_roundtable, continue_roundtable, control_session, list_sessions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleStartRoundtable,
  handleContinueRoundtable,
  handleControlSession,
  handleListSessions,
} from '../../../../src/mcp/handlers/session.js';
import type { DebateEngine } from '../../../../src/core/debate-engine.js';
import type { SessionManager } from '../../../../src/core/session-manager.js';
import type { KeyPointsExtractor } from '../../../../src/core/key-points-extractor.js';
import type { AgentRegistry } from '../../../../src/agents/registry.js';
import type {
  Session,
  AgentResponse,
  RoundResult,
  ConsensusResult,
} from '../../../../src/types/index.js';

/**
 * Helper to create a mock session
 */
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    topic: 'Should AI be regulated?',
    mode: 'collaborative',
    agentIds: ['agent-1', 'agent-2'],
    status: 'active',
    currentRound: 1,
    totalRounds: 3,
    responses: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Helper to create a mock agent response
 */
function createMockAgentResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    agentId: 'agent-1',
    agentName: 'Claude',
    position: 'AI should be regulated for safety',
    reasoning: 'AI systems can have significant impacts on society...',
    confidence: 0.85,
    timestamp: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Helper to create a mock round result
 */
function createMockRoundResult(overrides: Partial<RoundResult> = {}): RoundResult {
  return {
    roundNumber: 1,
    responses: [
      createMockAgentResponse({ agentId: 'agent-1', agentName: 'Claude' }),
      createMockAgentResponse({ agentId: 'agent-2', agentName: 'ChatGPT' }),
    ],
    consensus: {
      agreementLevel: 0.75,
      commonGround: ['Safety is important'],
      disagreementPoints: [],
      summary: 'Agents agree on the importance of AI regulation.',
    },
    ...overrides,
  };
}

/**
 * Create mock SessionManager
 */
function createMockSessionManager() {
  return {
    createSession: vi.fn(),
    getSession: vi.fn(),
    updateSessionRound: vi.fn(),
    updateSessionStatus: vi.fn(),
    addResponse: vi.fn(),
    listSessions: vi.fn(),
    getResponses: vi.fn(),
    getResponsesForRound: vi.fn(),
  };
}

/**
 * Create mock DebateEngine
 */
function createMockDebateEngine() {
  return {
    executeRounds: vi.fn(),
  };
}

/**
 * Create mock AgentRegistry
 */
function createMockAgentRegistry() {
  return {
    getAllAgentIds: vi.fn(),
    hasAgent: vi.fn(),
    getAgents: vi.fn(),
    getRegisteredProviders: vi.fn(),
    createAgent: vi.fn(),
    hasProvider: vi.fn(),
    getDefaultModel: vi.fn(),
  };
}

/**
 * Create mock KeyPointsExtractor
 */
function createMockKeyPointsExtractor() {
  return {
    extractKeyPointsBatch: vi.fn(),
  };
}

/**
 * Helper to parse response content
 */
function parseResponseContent(response: {
  content: Array<{ type: string; text: string }>;
}): unknown {
  return JSON.parse(response.content[0].text);
}

describe('handleStartRoundtable', () => {
  let mockDebateEngine: ReturnType<typeof createMockDebateEngine>;
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;
  let mockAgentRegistry: ReturnType<typeof createMockAgentRegistry>;
  let mockKeyPointsExtractor: ReturnType<typeof createMockKeyPointsExtractor>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDebateEngine = createMockDebateEngine();
    mockSessionManager = createMockSessionManager();
    mockAgentRegistry = createMockAgentRegistry();
    mockKeyPointsExtractor = createMockKeyPointsExtractor();
  });

  it('should start roundtable with specified agents', async () => {
    const session = createMockSession({ currentRound: 0 });
    const roundResult = createMockRoundResult();

    mockSessionManager.createSession.mockResolvedValue(session);
    mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic', 'openai']);
    mockAgentRegistry.hasProvider.mockReturnValue(true);
    mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
    mockAgentRegistry.hasProvider.mockReturnValue(true);
    mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
    mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
    mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
    mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
    mockKeyPointsExtractor.extractKeyPointsBatch.mockResolvedValue(new Map());

    const result = await handleStartRoundtable(
      {
        topic: 'Should AI be regulated?',
        mode: 'collaborative',
        agentCount: 2,
        rounds: 3,
      },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result);
    expect(parsed).toHaveProperty('sessionId');
    expect(parsed).toHaveProperty('topic', 'Should AI be regulated?');
    expect(mockSessionManager.createSession).toHaveBeenCalled();
    expect(mockDebateEngine.executeRounds).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      1,
      undefined,
      undefined
    );
  });

  it('should use all registered agents when none specified', async () => {
    const session = createMockSession({ currentRound: 0 });
    const roundResult = createMockRoundResult();

    mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic']);
    mockAgentRegistry.hasProvider.mockReturnValue(true);
    mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
    mockAgentRegistry.hasProvider.mockReturnValue(true);
    mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
    mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
    mockAgentRegistry.getAgents.mockReturnValue([
      { id: 'agent-1' },
      { id: 'agent-2' },
      { id: 'agent-3' },
      { id: 'agent-4' },
    ]);
    mockSessionManager.createSession.mockResolvedValue(session);
    mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
    mockKeyPointsExtractor.extractKeyPointsBatch.mockResolvedValue(new Map());

    const result = await handleStartRoundtable(
      { topic: 'Test topic' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result);
    expect(parsed).toHaveProperty('sessionId');
    expect(mockAgentRegistry.getRegisteredProviders).toHaveBeenCalled();
    // Should create default count of agents (4)
    expect(mockAgentRegistry.createAgent).toHaveBeenCalledTimes(4);
  });

  it('should return error when no agents available', async () => {
    mockAgentRegistry.getRegisteredProviders.mockReturnValue([]);
    mockAgentRegistry.hasProvider.mockReturnValue(true);
    mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');

    const result = await handleStartRoundtable(
      { topic: 'Test topic' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No agents available');
  });

  it('should return error when specified agent not found', async () => {
    const session = createMockSession({ currentRound: 0 });
    const roundResult = createMockRoundResult();

    mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic']);
    mockAgentRegistry.hasProvider.mockReturnValue(true);
    mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
    mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
    // Return 5 agents to match the capped count (DEFAULT_MAX_AGENTS = 5)
    mockAgentRegistry.getAgents.mockReturnValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `agent-${i + 1}` }))
    );
    mockSessionManager.createSession.mockResolvedValue(session);
    mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
    mockKeyPointsExtractor.extractKeyPointsBatch.mockResolvedValue(new Map());

    // Request more than config max (5) but within schema max (10)
    const result = await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 8 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result);
    expect(parsed).toHaveProperty('sessionId');
    // Should be capped at config max (5), not 8
    expect(mockAgentRegistry.createAgent).toHaveBeenCalledTimes(5);
  });

  it('should reject invalid input (missing topic)', async () => {
    const result = await handleStartRoundtable(
      {},
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should reject invalid input (empty topic)', async () => {
    const result = await handleStartRoundtable(
      { topic: '' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should reject invalid mode', async () => {
    const result = await handleStartRoundtable(
      { topic: 'Test topic', mode: 'invalid-mode' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should work without key points extractor', async () => {
    const session = createMockSession({ currentRound: 0 });
    const roundResult = createMockRoundResult();

    mockSessionManager.createSession.mockResolvedValue(session);
    mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic']);
    mockAgentRegistry.hasProvider.mockReturnValue(true);
    mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
    mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
    mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
    mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);

    const result = await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 2 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      null // No key points extractor
    );

    const parsed = parseResponseContent(result);
    expect(parsed).toHaveProperty('sessionId');
  });

  it('should return error when no round results available', async () => {
    const session = createMockSession({ currentRound: 0 });

    mockSessionManager.createSession.mockResolvedValue(session);
    mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic']);
    mockAgentRegistry.hasProvider.mockReturnValue(true);
    mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
    mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
    mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
    mockDebateEngine.executeRounds.mockResolvedValue([]);

    const result = await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 2 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      null
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No round results available');
  });

  describe('perspectives parameter for expert-panel mode', () => {
    it('should accept string array perspectives', async () => {
      const session = createMockSession({ mode: 'expert-panel', currentRound: 0 });
      const roundResult = createMockRoundResult();

      mockSessionManager.createSession.mockResolvedValue(session);
      mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic']);
      mockAgentRegistry.hasProvider.mockReturnValue(true);
      mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
      mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
      mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
      mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
      mockKeyPointsExtractor.extractKeyPointsBatch.mockResolvedValue(new Map());

      const result = await handleStartRoundtable(
        {
          topic: 'AI Ethics',
          mode: 'expert-panel',
          agentCount: 2,
          perspectives: ['Technical', 'Economic'],
        },
        mockDebateEngine as unknown as DebateEngine,
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry,
        mockKeyPointsExtractor as unknown as KeyPointsExtractor
      );

      const parsed = parseResponseContent(result);
      expect(parsed).toHaveProperty('sessionId');
      // createSession is called with (config, normalizedPerspectives)
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'expert-panel' }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'Technical' }),
          expect.objectContaining({ name: 'Economic' }),
        ])
      );
    });

    it('should accept perspective objects with descriptions', async () => {
      const session = createMockSession({ mode: 'expert-panel', currentRound: 0 });
      const roundResult = createMockRoundResult();

      mockSessionManager.createSession.mockResolvedValue(session);
      mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic']);
      mockAgentRegistry.hasProvider.mockReturnValue(true);
      mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
      mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
      mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
      mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
      mockKeyPointsExtractor.extractKeyPointsBatch.mockResolvedValue(new Map());

      const result = await handleStartRoundtable(
        {
          topic: 'AI Ethics',
          mode: 'expert-panel',
          agentCount: 2,
          perspectives: [{ name: 'Technical', description: 'Focus on implementation feasibility' }],
        },
        mockDebateEngine as unknown as DebateEngine,
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry,
        mockKeyPointsExtractor as unknown as KeyPointsExtractor
      );

      const parsed = parseResponseContent(result);
      expect(parsed).toHaveProperty('sessionId');
      // createSession is called with (config, normalizedPerspectives)
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'expert-panel' }),
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Technical',
            description: 'Focus on implementation feasibility',
          }),
        ])
      );
    });

    it('should accept mixed string and object perspectives', async () => {
      const session = createMockSession({ mode: 'expert-panel', currentRound: 0 });
      const roundResult = createMockRoundResult();

      mockSessionManager.createSession.mockResolvedValue(session);
      mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic']);
      mockAgentRegistry.hasProvider.mockReturnValue(true);
      mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
      mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
      mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
      mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
      mockKeyPointsExtractor.extractKeyPointsBatch.mockResolvedValue(new Map());

      const result = await handleStartRoundtable(
        {
          topic: 'AI Ethics',
          mode: 'expert-panel',
          agentCount: 2,
          perspectives: ['Technical', { name: 'Economic', description: 'Cost analysis' }],
        },
        mockDebateEngine as unknown as DebateEngine,
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry,
        mockKeyPointsExtractor as unknown as KeyPointsExtractor
      );

      const parsed = parseResponseContent(result);
      expect(parsed).toHaveProperty('sessionId');
    });

    it('should not normalize perspectives for non-expert-panel modes', async () => {
      const session = createMockSession({ mode: 'collaborative', currentRound: 0 });
      const roundResult = createMockRoundResult();

      mockSessionManager.createSession.mockResolvedValue(session);
      mockAgentRegistry.getRegisteredProviders.mockReturnValue(['anthropic']);
      mockAgentRegistry.hasProvider.mockReturnValue(true);
      mockAgentRegistry.getDefaultModel.mockReturnValue('claude-sonnet-4-5');
      mockAgentRegistry.createAgent.mockImplementation((config) => config.id);
      mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
      mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
      mockKeyPointsExtractor.extractKeyPointsBatch.mockResolvedValue(new Map());

      const result = await handleStartRoundtable(
        {
          topic: 'AI Ethics',
          mode: 'collaborative',
          agentCount: 2,
          perspectives: ['Technical'], // Passed but not normalized for non-expert-panel
        },
        mockDebateEngine as unknown as DebateEngine,
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry,
        mockKeyPointsExtractor as unknown as KeyPointsExtractor
      );

      const parsed = parseResponseContent(result);
      expect(parsed).toHaveProperty('sessionId');
      // For non-expert-panel modes, perspectives are NOT normalized (second arg undefined)
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'collaborative' }),
        undefined // perspectives not normalized for non-expert-panel modes
      );
    });
  });
});

describe('handleContinueRoundtable', () => {
  let mockDebateEngine: ReturnType<typeof createMockDebateEngine>;
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;
  let mockAgentRegistry: ReturnType<typeof createMockAgentRegistry>;
  let mockKeyPointsExtractor: ReturnType<typeof createMockKeyPointsExtractor>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDebateEngine = createMockDebateEngine();
    mockSessionManager = createMockSessionManager();
    mockAgentRegistry = createMockAgentRegistry();
    mockKeyPointsExtractor = createMockKeyPointsExtractor();
  });

  it('should continue roundtable successfully', async () => {
    const session = createMockSession({ currentRound: 1, status: 'active' });
    const roundResult = createMockRoundResult({ roundNumber: 2 });

    mockSessionManager.getSession.mockResolvedValue(session);
    mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
    mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
    mockSessionManager.getResponsesForRound.mockResolvedValue([]);
    mockKeyPointsExtractor.extractKeyPointsBatch.mockResolvedValue(new Map());

    const result = await handleContinueRoundtable(
      { sessionId: 'session-1', rounds: 1 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result);
    expect(parsed).toHaveProperty('sessionId');
    expect(mockDebateEngine.executeRounds).toHaveBeenCalled();
  });

  it('should return error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    const result = await handleContinueRoundtable(
      { sessionId: 'non-existent-session' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('non-existent-session');
    expect(parsed.error).toContain('not found');
  });

  it('should return error when session is not active', async () => {
    const session = createMockSession({ status: 'completed' });
    mockSessionManager.getSession.mockResolvedValue(session);

    const result = await handleContinueRoundtable(
      { sessionId: 'session-1' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('not active');
    expect(parsed.error).toContain('completed');
  });

  it('should return error when session is paused', async () => {
    const session = createMockSession({ status: 'paused' });
    mockSessionManager.getSession.mockResolvedValue(session);

    const result = await handleContinueRoundtable(
      { sessionId: 'session-1' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('not active');
  });

  it('should pass focus question to debate engine', async () => {
    const session = createMockSession({ currentRound: 1, status: 'active' });
    const roundResult = createMockRoundResult({ roundNumber: 2 });

    mockSessionManager.getSession.mockResolvedValue(session);
    mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }]);
    mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
    mockSessionManager.getResponsesForRound.mockResolvedValue([]);

    await handleContinueRoundtable(
      { sessionId: 'session-1', focusQuestion: 'What about safety?' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      null
    );

    expect(mockDebateEngine.executeRounds).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      1,
      'What about safety?',
      undefined
    );
  });

  it('should pass context results to debate engine', async () => {
    const session = createMockSession({ currentRound: 1, status: 'active' });
    const roundResult = createMockRoundResult({ roundNumber: 2 });
    const contextResults = [{ requestId: 'ctx-1', success: true, result: 'Context data' }];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }]);
    mockDebateEngine.executeRounds.mockResolvedValue([roundResult]);
    mockSessionManager.getResponsesForRound.mockResolvedValue([]);

    await handleContinueRoundtable(
      { sessionId: 'session-1', contextResults },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      null
    );

    expect(mockDebateEngine.executeRounds).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      1,
      undefined,
      contextResults
    );
  });

  it('should mark session as completed when reaching total rounds', async () => {
    const session = createMockSession({ currentRound: 2, totalRounds: 3, status: 'active' });
    // After executing, currentRound will be 3 (which equals totalRounds)
    const roundResult = createMockRoundResult({ roundNumber: 3 });

    mockSessionManager.getSession.mockResolvedValue(session);
    mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }]);
    mockDebateEngine.executeRounds.mockImplementation(async () => {
      session.currentRound = 3; // Simulate executeRounds updating the session
      return [roundResult];
    });
    mockSessionManager.getResponsesForRound.mockResolvedValue([]);

    await handleContinueRoundtable(
      { sessionId: 'session-1', rounds: 1 },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      null
    );

    expect(mockSessionManager.updateSessionStatus).toHaveBeenCalledWith('session-1', 'completed');
  });

  it('should reject invalid input (missing sessionId)', async () => {
    const result = await handleContinueRoundtable(
      {},
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should reject invalid input (empty sessionId)', async () => {
    const result = await handleContinueRoundtable(
      { sessionId: '' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      mockKeyPointsExtractor as unknown as KeyPointsExtractor
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should return error when no round results available', async () => {
    const session = createMockSession({ currentRound: 1, status: 'active' });

    mockSessionManager.getSession.mockResolvedValue(session);
    mockAgentRegistry.getAgents.mockReturnValue([{ id: 'agent-1' }]);
    mockDebateEngine.executeRounds.mockResolvedValue([]);

    const result = await handleContinueRoundtable(
      { sessionId: 'session-1' },
      mockDebateEngine as unknown as DebateEngine,
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry,
      null
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No round results available');
  });
});

describe('handleControlSession', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
  });

  describe('pause action', () => {
    it('should pause an active session', async () => {
      const session = createMockSession({ status: 'active' });
      const updatedSession = createMockSession({ status: 'paused' });

      mockSessionManager.getSession
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(updatedSession);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'pause' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('action', 'pause');
      expect(parsed).toHaveProperty('previousStatus', 'active');
      expect(parsed).toHaveProperty('newStatus', 'paused');
      expect(mockSessionManager.updateSessionStatus).toHaveBeenCalledWith('session-1', 'paused');
    });

    it('should reject pausing a non-active session', async () => {
      const session = createMockSession({ status: 'completed' });
      mockSessionManager.getSession.mockResolvedValue(session);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'pause' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Cannot pause');
      expect(parsed.error).toContain('completed');
    });

    it('should reject pausing an already paused session', async () => {
      const session = createMockSession({ status: 'paused' });
      mockSessionManager.getSession.mockResolvedValue(session);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'pause' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Cannot pause');
    });
  });

  describe('resume action', () => {
    it('should resume a paused session', async () => {
      const session = createMockSession({ status: 'paused' });
      const updatedSession = createMockSession({ status: 'active' });

      mockSessionManager.getSession
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(updatedSession);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'resume' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('action', 'resume');
      expect(parsed).toHaveProperty('previousStatus', 'paused');
      expect(parsed).toHaveProperty('newStatus', 'active');
      expect(mockSessionManager.updateSessionStatus).toHaveBeenCalledWith('session-1', 'active');
    });

    it('should reject resuming an active session', async () => {
      const session = createMockSession({ status: 'active' });
      mockSessionManager.getSession.mockResolvedValue(session);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'resume' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Cannot resume');
    });

    it('should reject resuming a completed session', async () => {
      const session = createMockSession({ status: 'completed' });
      mockSessionManager.getSession.mockResolvedValue(session);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'resume' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Cannot resume');
    });
  });

  describe('stop action', () => {
    it('should stop an active session', async () => {
      const session = createMockSession({ status: 'active' });
      const updatedSession = createMockSession({ status: 'completed' });

      mockSessionManager.getSession
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(updatedSession);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'stop' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('action', 'stop');
      expect(parsed).toHaveProperty('previousStatus', 'active');
      expect(parsed).toHaveProperty('newStatus', 'completed');
      expect(mockSessionManager.updateSessionStatus).toHaveBeenCalledWith('session-1', 'completed');
    });

    it('should stop a paused session', async () => {
      const session = createMockSession({ status: 'paused' });
      const updatedSession = createMockSession({ status: 'completed' });

      mockSessionManager.getSession
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(updatedSession);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'stop' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('action', 'stop');
      expect(parsed).toHaveProperty('newStatus', 'completed');
    });

    it('should reject stopping an already completed session', async () => {
      const session = createMockSession({ status: 'completed' });
      mockSessionManager.getSession.mockResolvedValue(session);

      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'stop' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('already completed');
    });
  });

  describe('error handling', () => {
    it('should return error when session not found', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      const result = await handleControlSession(
        { sessionId: 'non-existent-session', action: 'pause' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('non-existent-session');
      expect(parsed.error).toContain('not found');
    });

    it('should reject invalid input (missing sessionId)', async () => {
      const result = await handleControlSession(
        { action: 'pause' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
    });

    it('should reject invalid input (missing action)', async () => {
      const result = await handleControlSession(
        { sessionId: 'session-1' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
    });

    it('should reject invalid action', async () => {
      const result = await handleControlSession(
        { sessionId: 'session-1', action: 'invalid-action' },
        mockSessionManager as unknown as SessionManager
      );

      const parsed = parseResponseContent(result) as { error: string };
      expect(parsed).toHaveProperty('error');
    });
  });
});

describe('handleListSessions', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
  });

  it('should list all sessions when no filters provided', async () => {
    const sessions = [
      createMockSession({ id: 'session-1', topic: 'AI Safety' }),
      createMockSession({ id: 'session-2', topic: 'Climate Change' }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions({}, mockSessionManager as unknown as SessionManager);

    const parsed = parseResponseContent(result) as { sessions: unknown[]; count: number };
    expect(parsed).toHaveProperty('sessions');
    expect(parsed).toHaveProperty('count', 2);
    expect(parsed.sessions).toHaveLength(2);
  });

  it('should filter sessions by topic', async () => {
    const sessions = [
      createMockSession({ id: 'session-1', topic: 'AI Safety' }),
      createMockSession({ id: 'session-2', topic: 'Climate Change' }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { topic: 'AI' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as {
      sessions: Array<{ topic: string }>;
      count: number;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.sessions[0].topic).toBe('AI Safety');
  });

  it('should filter sessions by topic (case-insensitive)', async () => {
    const sessions = [
      createMockSession({ id: 'session-1', topic: 'AI Safety' }),
      createMockSession({ id: 'session-2', topic: 'Climate Change' }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { topic: 'ai' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { sessions: unknown[]; count: number };
    expect(parsed.count).toBe(1);
  });

  it('should filter sessions by mode', async () => {
    const sessions = [
      createMockSession({ id: 'session-1', mode: 'collaborative' }),
      createMockSession({ id: 'session-2', mode: 'adversarial' }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { mode: 'collaborative' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as {
      sessions: Array<{ mode: string }>;
      count: number;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.sessions[0].mode).toBe('collaborative');
  });

  it('should filter sessions by status', async () => {
    const sessions = [
      createMockSession({ id: 'session-1', status: 'active' }),
      createMockSession({ id: 'session-2', status: 'completed' }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { status: 'active' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as {
      sessions: Array<{ status: string }>;
      count: number;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.sessions[0].status).toBe('active');
  });

  it('should filter sessions by fromDate', async () => {
    const sessions = [
      createMockSession({ id: 'session-1', createdAt: new Date('2024-01-15') }),
      createMockSession({ id: 'session-2', createdAt: new Date('2024-01-05') }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { fromDate: '2024-01-10' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { sessions: unknown[]; count: number };
    expect(parsed.count).toBe(1);
  });

  it('should filter sessions by toDate', async () => {
    const sessions = [
      createMockSession({ id: 'session-1', createdAt: new Date('2024-01-15') }),
      createMockSession({ id: 'session-2', createdAt: new Date('2024-01-05') }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { toDate: '2024-01-10' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { sessions: unknown[]; count: number };
    expect(parsed.count).toBe(1);
  });

  it('should apply limit', async () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      createMockSession({ id: `session-${i}`, topic: `Topic ${i}` })
    );
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { limit: 5 },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { sessions: unknown[]; count: number };
    expect(parsed.count).toBe(5);
    expect(parsed.sessions).toHaveLength(5);
  });

  it('should apply default limit of 50', async () => {
    const sessions = Array.from({ length: 100 }, (_, i) =>
      createMockSession({ id: `session-${i}`, topic: `Topic ${i}` })
    );
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions({}, mockSessionManager as unknown as SessionManager);

    const parsed = parseResponseContent(result) as { sessions: unknown[]; count: number };
    expect(parsed.count).toBe(50);
  });

  it('should combine multiple filters', async () => {
    const sessions = [
      createMockSession({
        id: 'session-1',
        topic: 'AI Safety',
        mode: 'collaborative',
        status: 'active',
      }),
      createMockSession({
        id: 'session-2',
        topic: 'AI Ethics',
        mode: 'adversarial',
        status: 'active',
      }),
      createMockSession({
        id: 'session-3',
        topic: 'AI Safety',
        mode: 'collaborative',
        status: 'completed',
      }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { topic: 'AI Safety', mode: 'collaborative', status: 'active' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as {
      sessions: Array<{ id: string }>;
      count: number;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.sessions[0].id).toBe('session-1');
  });

  it('should return empty array when no sessions match', async () => {
    const sessions = [createMockSession({ id: 'session-1', topic: 'AI Safety' })];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions(
      { topic: 'Climate' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { sessions: unknown[]; count: number };
    expect(parsed.count).toBe(0);
    expect(parsed.sessions).toHaveLength(0);
  });

  it('should return session summaries with correct fields', async () => {
    const sessions = [
      createMockSession({
        id: 'session-1',
        topic: 'AI Safety',
        mode: 'collaborative',
        status: 'active',
        currentRound: 2,
        totalRounds: 3,
        agentIds: ['agent-1', 'agent-2'],
        responses: [createMockAgentResponse()],
      }),
    ];
    mockSessionManager.listSessions.mockResolvedValue(sessions);

    const result = await handleListSessions({}, mockSessionManager as unknown as SessionManager);

    const parsed = parseResponseContent(result) as { sessions: Array<Record<string, unknown>> };
    const summary = parsed.sessions[0];
    expect(summary).toHaveProperty('id', 'session-1');
    expect(summary).toHaveProperty('topic', 'AI Safety');
    expect(summary).toHaveProperty('mode', 'collaborative');
    expect(summary).toHaveProperty('status', 'active');
    expect(summary).toHaveProperty('currentRound', 2);
    expect(summary).toHaveProperty('totalRounds', 3);
    expect(summary).toHaveProperty('agentCount', 2);
    expect(summary).toHaveProperty('responseCount', 1);
    expect(summary).toHaveProperty('createdAt');
    expect(summary).toHaveProperty('updatedAt');
  });
});
