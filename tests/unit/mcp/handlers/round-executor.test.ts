/**
 * Tests for Round Executor utility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAndSaveRounds } from '../../../../src/mcp/handlers/utils/round-executor.js';
import type { DebateEngine } from '../../../../src/core/debate-engine.js';
import type { SessionManager } from '../../../../src/core/session-manager.js';
import type { KeyPointsExtractor } from '../../../../src/core/key-points-extractor.js';
import type { BaseAgent } from '../../../../src/agents/base.js';
import type { Session, RoundResult, AgentResponse } from '../../../../src/types/index.js';

describe('executeAndSaveRounds', () => {
  let mockDebateEngine: DebateEngine;
  let mockSessionManager: SessionManager;
  let mockKeyPointsExtractor: KeyPointsExtractor;
  let mockAgents: BaseAgent[];
  let mockSession: Session;

  const createMockResponse = (agentId: string): AgentResponse => ({
    agentId,
    agentName: `Agent ${agentId}`,
    position: 'Test position',
    reasoning: 'Test reasoning',
    confidence: 0.8,
    timestamp: new Date(),
  });

  const createMockRoundResult = (roundNumber: number): RoundResult => ({
    roundNumber,
    responses: [createMockResponse('agent-1'), createMockResponse('agent-2')],
    consensus: {
      agreementLevel: 0.75,
      summary: 'Test consensus',
      keyPoints: ['Point 1'],
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockSession = {
      id: 'session-1',
      topic: 'Test topic',
      mode: 'collaborative',
      agentIds: ['agent-1', 'agent-2'],
      status: 'active',
      currentRound: 0,
      totalRounds: 3,
      responses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockAgents = [{ id: 'agent-1' }, { id: 'agent-2' }] as BaseAgent[];

    mockDebateEngine = {
      executeRounds: vi.fn().mockResolvedValue([createMockRoundResult(1)]),
    } as unknown as DebateEngine;

    mockSessionManager = {
      updateSessionRound: vi.fn().mockResolvedValue(undefined),
      addResponse: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionManager;

    mockKeyPointsExtractor = {
      extractKeyPointsBatch: vi.fn().mockResolvedValue(
        new Map([
          ['agent-1', ['Key point 1']],
          ['agent-2', ['Key point 2']],
        ])
      ),
    } as unknown as KeyPointsExtractor;
  });

  it('should execute rounds via debateEngine', async () => {
    await executeAndSaveRounds(mockDebateEngine, mockSessionManager, mockSession, mockAgents, null);

    expect(mockDebateEngine.executeRounds).toHaveBeenCalledWith(
      mockAgents,
      mockSession,
      1,
      undefined,
      undefined
    );
  });

  it('should pass focusQuestion to debateEngine', async () => {
    await executeAndSaveRounds(
      mockDebateEngine,
      mockSessionManager,
      mockSession,
      mockAgents,
      null,
      { focusQuestion: 'What about X?' }
    );

    expect(mockDebateEngine.executeRounds).toHaveBeenCalledWith(
      mockAgents,
      mockSession,
      1,
      'What about X?',
      undefined
    );
  });

  it('should pass contextResults to debateEngine', async () => {
    const contextResults = [{ query: 'Test', result: 'Answer', agentId: 'agent-1' }];

    await executeAndSaveRounds(
      mockDebateEngine,
      mockSessionManager,
      mockSession,
      mockAgents,
      null,
      { contextResults }
    );

    expect(mockDebateEngine.executeRounds).toHaveBeenCalledWith(
      mockAgents,
      mockSession,
      1,
      undefined,
      contextResults
    );
  });

  it('should update session round tracking', async () => {
    mockSession.currentRound = 1;

    await executeAndSaveRounds(mockDebateEngine, mockSessionManager, mockSession, mockAgents, null);

    expect(mockSessionManager.updateSessionRound).toHaveBeenCalledWith('session-1', 1);
  });

  it('should save all responses to session', async () => {
    await executeAndSaveRounds(mockDebateEngine, mockSessionManager, mockSession, mockAgents, null);

    // Should save 2 responses (one per agent)
    expect(mockSessionManager.addResponse).toHaveBeenCalledTimes(2);
    expect(mockSessionManager.addResponse).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ agentId: 'agent-1' }),
      1
    );
    expect(mockSessionManager.addResponse).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ agentId: 'agent-2' }),
      1
    );
  });

  it('should extract key points when extractor is provided', async () => {
    const result = await executeAndSaveRounds(
      mockDebateEngine,
      mockSessionManager,
      mockSession,
      mockAgents,
      mockKeyPointsExtractor
    );

    expect(mockKeyPointsExtractor.extractKeyPointsBatch).toHaveBeenCalled();
    expect(result.keyPointsMap.get('agent-1')).toEqual(['Key point 1']);
    expect(result.keyPointsMap.get('agent-2')).toEqual(['Key point 2']);
  });

  it('should return empty keyPointsMap when extractor is null', async () => {
    const result = await executeAndSaveRounds(
      mockDebateEngine,
      mockSessionManager,
      mockSession,
      mockAgents,
      null
    );

    expect(result.keyPointsMap.size).toBe(0);
  });

  it('should return round results', async () => {
    const result = await executeAndSaveRounds(
      mockDebateEngine,
      mockSessionManager,
      mockSession,
      mockAgents,
      null
    );

    expect(result.roundResults).toHaveLength(1);
    expect(result.roundResults[0].roundNumber).toBe(1);
    expect(result.roundResults[0].responses).toHaveLength(2);
  });

  it('should always execute exactly one round', async () => {
    await executeAndSaveRounds(
      mockDebateEngine,
      mockSessionManager,
      mockSession,
      mockAgents,
      null
    );

    // Verify that executeRounds is always called with 1 round
    expect(mockDebateEngine.executeRounds).toHaveBeenCalledWith(
      mockAgents,
      mockSession,
      1,
      undefined,
      undefined
    );
  });
});
