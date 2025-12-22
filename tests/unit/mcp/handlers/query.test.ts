/**
 * Tests for MCP query handlers
 * Handles: get_consensus, get_round_details, get_response_detail, get_citations, get_thoughts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleGetConsensus,
  handleGetRoundDetails,
  handleGetResponseDetail,
  handleGetCitations,
  handleGetThoughts,
} from '../../../../src/mcp/handlers/query.js';
import type { SessionManager } from '../../../../src/core/session-manager.js';
import type { AIConsensusAnalyzer } from '../../../../src/core/ai-consensus-analyzer.js';
import type {
  Session,
  AgentResponse,
  Citation,
  ToolCallRecord,
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
    currentRound: 2,
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
 * Helper to create a mock citation
 */
function createMockCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    title: 'AI Safety Research',
    url: 'https://example.com/ai-safety',
    snippet: 'Research on AI safety...',
    ...overrides,
  };
}

/**
 * Helper to create a mock tool call record
 */
function createMockToolCall(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    toolName: 'web_search',
    input: { query: 'AI regulation' },
    output: { results: [] },
    timestamp: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create mock SessionManager
 */
function createMockSessionManager() {
  return {
    getSession: vi.fn(),
    getResponses: vi.fn(),
    getResponsesForRound: vi.fn(),
  };
}

/**
 * Create mock AIConsensusAnalyzer
 */
function createMockAIConsensusAnalyzer() {
  return {
    analyzeConsensus: vi.fn().mockResolvedValue({
      agreementLevel: 0.75,
      commonGround: ['Safety is important'],
      disagreementPoints: ['Implementation approach'],
      summary: 'Agents largely agree on the need for regulation.',
    }),
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

describe('handleGetConsensus', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;
  let mockAIConsensusAnalyzer: ReturnType<typeof createMockAIConsensusAnalyzer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
    mockAIConsensusAnalyzer = createMockAIConsensusAnalyzer();
  });

  it('should return consensus analysis for latest round by default', async () => {
    const session = createMockSession({ currentRound: 2 });
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1' }),
      createMockAgentResponse({ agentId: 'agent-2' }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponsesForRound.mockResolvedValue(responses);

    const result = await handleGetConsensus(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as Record<string, unknown>;
    expect(parsed).toHaveProperty('sessionId', 'session-1');
    expect(parsed).toHaveProperty('consensus');
    expect(parsed).toHaveProperty('analyzedRound', 2);
    expect(parsed).toHaveProperty('responseCount', 2);
    expect(mockSessionManager.getResponsesForRound).toHaveBeenCalledWith('session-1', 2);
  });

  it('should return consensus analysis for specified round', async () => {
    const session = createMockSession({ currentRound: 3 });
    const responses = [createMockAgentResponse()];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponsesForRound.mockResolvedValue(responses);

    const result = await handleGetConsensus(
      { sessionId: 'session-1', roundNumber: 2 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as Record<string, unknown>;
    expect(parsed).toHaveProperty('analyzedRound', 2);
    expect(mockSessionManager.getResponsesForRound).toHaveBeenCalledWith('session-1', 2);
  });

  it('should return error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    const result = await handleGetConsensus(
      { sessionId: 'non-existent-session' },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('non-existent-session');
    expect(parsed.error).toContain('not found');
  });

  it('should return error when no rounds have been executed', async () => {
    const session = createMockSession({ currentRound: 0 });
    mockSessionManager.getSession.mockResolvedValue(session);

    const result = await handleGetConsensus(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No rounds have been executed');
  });

  it('should return error when requested round does not exist', async () => {
    const session = createMockSession({ currentRound: 2 });
    mockSessionManager.getSession.mockResolvedValue(session);

    const result = await handleGetConsensus(
      { sessionId: 'session-1', roundNumber: 5 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('Round 5 does not exist');
  });

  it('should return error when no responses found for round', async () => {
    const session = createMockSession({ currentRound: 2 });
    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponsesForRound.mockResolvedValue([]);

    const result = await handleGetConsensus(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No responses found');
  });

  it('should return error when AI consensus analyzer is not available', async () => {
    const session = createMockSession({ currentRound: 2 });
    const responses = [createMockAgentResponse()];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponsesForRound.mockResolvedValue(responses);

    const result = await handleGetConsensus(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager,
      null
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('AI consensus analyzer not available');
  });

  it('should reject invalid input (missing sessionId)', async () => {
    const result = await handleGetConsensus(
      {},
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should reject invalid roundNumber (0 or negative)', async () => {
    const result = await handleGetConsensus(
      { sessionId: 'session-1', roundNumber: 0 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });
});

describe('handleGetRoundDetails', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;
  let mockAIConsensusAnalyzer: ReturnType<typeof createMockAIConsensusAnalyzer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
    mockAIConsensusAnalyzer = createMockAIConsensusAnalyzer();
  });

  it('should return round details successfully', async () => {
    const session = createMockSession({ currentRound: 2 });
    const responses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        agentName: 'Claude',
        citations: [createMockCitation()],
        toolCalls: [createMockToolCall()],
      }),
      createMockAgentResponse({
        agentId: 'agent-2',
        agentName: 'ChatGPT',
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponsesForRound.mockResolvedValue(responses);

    const result = await handleGetRoundDetails(
      { sessionId: 'session-1', roundNumber: 1 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as Record<string, unknown>;
    expect(parsed).toHaveProperty('sessionId', 'session-1');
    expect(parsed).toHaveProperty('roundNumber', 1);
    expect(parsed).toHaveProperty('responses');
    expect(parsed).toHaveProperty('consensus');
    expect((parsed.responses as unknown[]).length).toBe(2);
  });

  it('should format response correctly with citations and tool calls', async () => {
    const session = createMockSession({ currentRound: 2 });
    const responses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        citations: [createMockCitation({ title: 'Source 1' })],
        toolCalls: [createMockToolCall({ toolName: 'web_search' })],
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponsesForRound.mockResolvedValue(responses);

    const result = await handleGetRoundDetails(
      { sessionId: 'session-1', roundNumber: 1 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { responses: Array<Record<string, unknown>> };
    const response = parsed.responses[0];
    expect(response).toHaveProperty('agentId', 'agent-1');
    expect(response).toHaveProperty('position');
    expect(response).toHaveProperty('reasoning');
    expect(response).toHaveProperty('confidence');
    expect(response).toHaveProperty('citations');
    expect(response).toHaveProperty('toolCalls');
    expect((response.citations as unknown[]).length).toBe(1);
    expect((response.toolCalls as unknown[]).length).toBe(1);
  });

  it('should return error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    const result = await handleGetRoundDetails(
      { sessionId: 'non-existent', roundNumber: 1 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('not found');
  });

  it('should return error when round has not been executed yet', async () => {
    const session = createMockSession({ currentRound: 1 });
    mockSessionManager.getSession.mockResolvedValue(session);

    const result = await handleGetRoundDetails(
      { sessionId: 'session-1', roundNumber: 3 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('Round 3 has not been executed yet');
  });

  it('should return error when no responses found for round', async () => {
    const session = createMockSession({ currentRound: 2 });
    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponsesForRound.mockResolvedValue([]);

    const result = await handleGetRoundDetails(
      { sessionId: 'session-1', roundNumber: 1 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No responses found');
  });

  it('should return error when AI consensus analyzer is not available', async () => {
    const session = createMockSession({ currentRound: 2 });
    const responses = [createMockAgentResponse()];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponsesForRound.mockResolvedValue(responses);

    const result = await handleGetRoundDetails(
      { sessionId: 'session-1', roundNumber: 1 },
      mockSessionManager as unknown as SessionManager,
      null
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('AI consensus analyzer not available');
  });

  it('should reject invalid input (missing roundNumber)', async () => {
    const result = await handleGetRoundDetails(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should reject invalid roundNumber (0)', async () => {
    const result = await handleGetRoundDetails(
      { sessionId: 'session-1', roundNumber: 0 },
      mockSessionManager as unknown as SessionManager,
      mockAIConsensusAnalyzer as unknown as AIConsensusAnalyzer
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });
});

describe('handleGetResponseDetail', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
  });

  it('should return all responses for an agent across all rounds', async () => {
    const session = createMockSession({ currentRound: 2, agentIds: ['agent-1', 'agent-2'] });
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1', position: 'Round 1 position' }),
      createMockAgentResponse({ agentId: 'agent-2', position: 'Round 1 position' }),
      createMockAgentResponse({ agentId: 'agent-1', position: 'Round 2 position' }),
      createMockAgentResponse({ agentId: 'agent-2', position: 'Round 2 position' }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetResponseDetail(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { responses: unknown[]; agentId: string };
    expect(parsed).toHaveProperty('sessionId', 'session-1');
    expect(parsed).toHaveProperty('agentId', 'agent-1');
    expect(parsed).toHaveProperty('agentName', 'Claude');
    expect(parsed.responses).toHaveLength(2);
  });

  it('should return response for specific round when roundNumber provided', async () => {
    const session = createMockSession({ currentRound: 2, agentIds: ['agent-1', 'agent-2'] });
    const allResponses = [createMockAgentResponse({ agentId: 'agent-1', position: 'All round' })];
    const roundResponses = [
      createMockAgentResponse({ agentId: 'agent-1', position: 'Round 1 only' }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(allResponses);
    mockSessionManager.getResponsesForRound.mockResolvedValue(roundResponses);

    const result = await handleGetResponseDetail(
      { sessionId: 'session-1', agentId: 'agent-1', roundNumber: 1 },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as {
      responses: Array<{ position: string }>;
      roundNumber: number;
    };
    expect(parsed).toHaveProperty('roundNumber', 1);
    expect(parsed.responses[0].position).toBe('Round 1 only');
    expect(mockSessionManager.getResponsesForRound).toHaveBeenCalledWith('session-1', 1);
  });

  it('should return error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    const result = await handleGetResponseDetail(
      { sessionId: 'non-existent', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('not found');
  });

  it('should return error when agent did not participate in session', async () => {
    const session = createMockSession({ agentIds: ['agent-1', 'agent-2'] });
    mockSessionManager.getSession.mockResolvedValue(session);

    const result = await handleGetResponseDetail(
      { sessionId: 'session-1', agentId: 'agent-3' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('agent-3');
    expect(parsed.error).toContain('did not participate');
  });

  it('should return error when no responses found for agent', async () => {
    const session = createMockSession({ agentIds: ['agent-1', 'agent-2'] });
    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue([
      createMockAgentResponse({ agentId: 'agent-2' }),
    ]);

    const result = await handleGetResponseDetail(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No responses found');
  });

  it('should return error when no responses found for agent in specific round', async () => {
    const session = createMockSession({ agentIds: ['agent-1', 'agent-2'] });
    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue([
      createMockAgentResponse({ agentId: 'agent-1' }),
    ]);
    mockSessionManager.getResponsesForRound.mockResolvedValue([
      createMockAgentResponse({ agentId: 'agent-2' }), // Different agent
    ]);

    const result = await handleGetResponseDetail(
      { sessionId: 'session-1', agentId: 'agent-1', roundNumber: 2 },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No responses found');
    expect(parsed.error).toContain('round 2');
  });

  it('should reject invalid input (missing agentId)', async () => {
    const result = await handleGetResponseDetail(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should reject invalid input (empty agentId)', async () => {
    const result = await handleGetResponseDetail(
      { sessionId: 'session-1', agentId: '' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should include response details (citations, toolCalls)', async () => {
    const session = createMockSession({ agentIds: ['agent-1'] });
    const responses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        citations: [createMockCitation()],
        toolCalls: [createMockToolCall()],
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetResponseDetail(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { responses: Array<Record<string, unknown>> };
    const response = parsed.responses[0];
    expect(response).toHaveProperty('citations');
    expect(response).toHaveProperty('toolCalls');
  });
});

describe('handleGetCitations', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
  });

  it('should return all citations from session', async () => {
    const session = createMockSession();
    const responses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        agentName: 'Claude',
        citations: [
          createMockCitation({ title: 'Source 1', url: 'https://example.com/1' }),
          createMockCitation({ title: 'Source 2', url: 'https://example.com/2' }),
        ],
      }),
      createMockAgentResponse({
        agentId: 'agent-2',
        agentName: 'ChatGPT',
        citations: [createMockCitation({ title: 'Source 3', url: 'https://example.com/3' })],
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetCitations(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { citations: unknown[]; totalCitations: number };
    expect(parsed).toHaveProperty('sessionId', 'session-1');
    expect(parsed).toHaveProperty('totalCitations', 3);
    expect(parsed.citations).toHaveLength(3);
  });

  it('should filter citations by roundNumber', async () => {
    const session = createMockSession();
    const roundResponses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        citations: [createMockCitation({ title: 'Round 1 Source' })],
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue([]);
    mockSessionManager.getResponsesForRound.mockResolvedValue(roundResponses);

    const result = await handleGetCitations(
      { sessionId: 'session-1', roundNumber: 1 },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { roundNumber: number; totalCitations: number };
    expect(parsed).toHaveProperty('roundNumber', 1);
    expect(mockSessionManager.getResponsesForRound).toHaveBeenCalledWith('session-1', 1);
  });

  it('should filter citations by agentId', async () => {
    const session = createMockSession();
    const responses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        citations: [createMockCitation({ title: 'Agent 1 Source' })],
      }),
      createMockAgentResponse({
        agentId: 'agent-2',
        citations: [createMockCitation({ title: 'Agent 2 Source' })],
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetCitations(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as {
      agentId: string;
      citations: unknown[];
      totalCitations: number;
    };
    expect(parsed).toHaveProperty('agentId', 'agent-1');
    expect(parsed.totalCitations).toBe(1);
  });

  it('should deduplicate citations by URL', async () => {
    const session = createMockSession();
    const responses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        citations: [createMockCitation({ title: 'Source', url: 'https://example.com/same' })],
      }),
      createMockAgentResponse({
        agentId: 'agent-2',
        citations: [createMockCitation({ title: 'Source Copy', url: 'https://example.com/same' })],
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetCitations(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { citations: unknown[]; totalCitations: number };
    expect(parsed.totalCitations).toBe(1);
  });

  it('should return empty citations when responses have no citations', async () => {
    const session = createMockSession();
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1', citations: undefined }),
      createMockAgentResponse({ agentId: 'agent-2', citations: [] }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetCitations(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { citations: unknown[]; totalCitations: number };
    expect(parsed.totalCitations).toBe(0);
    expect(parsed.citations).toHaveLength(0);
  });

  it('should return error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    const result = await handleGetCitations(
      { sessionId: 'non-existent' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('not found');
  });

  it('should reject invalid input (missing sessionId)', async () => {
    const result = await handleGetCitations({}, mockSessionManager as unknown as SessionManager);

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should include agent metadata with citations', async () => {
    const session = createMockSession();
    const responses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        agentName: 'Claude',
        citations: [createMockCitation()],
        timestamp: new Date('2024-01-15'),
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetCitations(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { citations: Array<Record<string, unknown>> };
    const citation = parsed.citations[0];
    expect(citation).toHaveProperty('agentId', 'agent-1');
    expect(citation).toHaveProperty('agentName', 'Claude');
    expect(citation).toHaveProperty('timestamp');
  });
});

describe('handleGetThoughts', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
  });

  it('should return agent thoughts across all rounds', async () => {
    const session = createMockSession({ agentIds: ['agent-1', 'agent-2'] });
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1', confidence: 0.7 }),
      createMockAgentResponse({ agentId: 'agent-2', confidence: 0.6 }),
      createMockAgentResponse({ agentId: 'agent-1', confidence: 0.8 }),
      createMockAgentResponse({ agentId: 'agent-2', confidence: 0.75 }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetThoughts(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as Record<string, unknown>;
    expect(parsed).toHaveProperty('sessionId', 'session-1');
    expect(parsed).toHaveProperty('agentId', 'agent-1');
    expect(parsed).toHaveProperty('agentName', 'Claude');
    expect(parsed).toHaveProperty('totalResponses', 2);
    expect(parsed).toHaveProperty('responses');
    expect(parsed).toHaveProperty('confidenceEvolution');
  });

  it('should track confidence evolution across rounds', async () => {
    const session = createMockSession({ agentIds: ['agent-1'] });
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1', confidence: 0.5 }),
      createMockAgentResponse({ agentId: 'agent-1', confidence: 0.7 }),
      createMockAgentResponse({ agentId: 'agent-1', confidence: 0.9 }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetThoughts(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as {
      confidenceEvolution: Array<{ round: number; confidence: number }>;
    };
    expect(parsed.confidenceEvolution).toHaveLength(3);
    expect(parsed.confidenceEvolution[0].confidence).toBe(0.5);
    expect(parsed.confidenceEvolution[1].confidence).toBe(0.7);
    expect(parsed.confidenceEvolution[2].confidence).toBe(0.9);
  });

  it('should return error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    const result = await handleGetThoughts(
      { sessionId: 'non-existent', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('not found');
  });

  it('should return error when agent did not participate in session', async () => {
    const session = createMockSession({ agentIds: ['agent-1', 'agent-2'] });
    mockSessionManager.getSession.mockResolvedValue(session);

    const result = await handleGetThoughts(
      { sessionId: 'session-1', agentId: 'agent-3' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('agent-3');
    expect(parsed.error).toContain('did not participate');
  });

  it('should return error when no responses found for agent', async () => {
    const session = createMockSession({ agentIds: ['agent-1', 'agent-2'] });
    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue([
      createMockAgentResponse({ agentId: 'agent-2' }),
    ]);

    const result = await handleGetThoughts(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('No responses found');
  });

  it('should reject invalid input (missing agentId)', async () => {
    const result = await handleGetThoughts(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should reject invalid input (empty agentId)', async () => {
    const result = await handleGetThoughts(
      { sessionId: 'session-1', agentId: '' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
  });

  it('should include response details in thoughts', async () => {
    const session = createMockSession({ agentIds: ['agent-1'] });
    const responses = [
      createMockAgentResponse({
        agentId: 'agent-1',
        citations: [createMockCitation()],
        toolCalls: [createMockToolCall()],
      }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetThoughts(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { responses: Array<Record<string, unknown>> };
    const response = parsed.responses[0];
    expect(response).toHaveProperty('position');
    expect(response).toHaveProperty('reasoning');
    expect(response).toHaveProperty('confidence');
    expect(response).toHaveProperty('citations');
    expect(response).toHaveProperty('toolCalls');
  });

  it('should report number of rounds agent participated in', async () => {
    const session = createMockSession({ agentIds: ['agent-1', 'agent-2'] });
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1' }),
      createMockAgentResponse({ agentId: 'agent-2' }),
      createMockAgentResponse({ agentId: 'agent-1' }),
      createMockAgentResponse({ agentId: 'agent-2' }),
      createMockAgentResponse({ agentId: 'agent-1' }),
      createMockAgentResponse({ agentId: 'agent-2' }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const result = await handleGetThoughts(
      { sessionId: 'session-1', agentId: 'agent-1' },
      mockSessionManager as unknown as SessionManager
    );

    const parsed = parseResponseContent(result) as { totalResponses: number; rounds: number };
    expect(parsed.totalResponses).toBe(3);
    expect(parsed.rounds).toBeGreaterThan(0);
  });
});
