/**
 * Tests for MCP handler utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
  mapResponseForOutput,
  mapResponseWithAgentForOutput,
  getSessionOrError,
  isSessionError,
  groupResponsesByRound,
  wrapError,
  type MappedResponse,
} from '../../../../src/mcp/handlers/utils/index.js';
import type { AgentResponse, Session } from '../../../../src/types/index.js';
import type { SessionManager } from '../../../../src/core/session-manager.js';

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

describe('mapResponseForOutput', () => {
  it('should map basic response fields', () => {
    const response = createMockAgentResponse();
    const mapped = mapResponseForOutput(response);

    expect(mapped.position).toBe(response.position);
    expect(mapped.reasoning).toBe(response.reasoning);
    expect(mapped.confidence).toBe(response.confidence);
    expect(mapped.timestamp).toBe(response.timestamp);
  });

  it('should include stance field when present', () => {
    const response = createMockAgentResponse({ stance: 'YES' });
    const mapped = mapResponseForOutput(response);

    expect(mapped.stance).toBe('YES');
  });

  it('should handle NEUTRAL stance', () => {
    const response = createMockAgentResponse({ stance: 'NEUTRAL' });
    const mapped = mapResponseForOutput(response);

    expect(mapped.stance).toBe('NEUTRAL');
  });

  it('should handle NO stance', () => {
    const response = createMockAgentResponse({ stance: 'NO' });
    const mapped = mapResponseForOutput(response);

    expect(mapped.stance).toBe('NO');
  });

  it('should handle undefined stance', () => {
    const response = createMockAgentResponse({ stance: undefined });
    const mapped = mapResponseForOutput(response);

    expect(mapped.stance).toBeUndefined();
  });

  it('should include citations when present', () => {
    const citations = [{ url: 'https://example.com', title: 'Example', snippet: 'test' }];
    const response = createMockAgentResponse({ citations });
    const mapped = mapResponseForOutput(response);

    expect(mapped.citations).toEqual(citations);
  });

  it('should map tool calls with only toolName and timestamp', () => {
    const toolCalls = [
      {
        toolName: 'web_search',
        input: { query: 'AI regulation' },
        output: { results: [] },
        timestamp: new Date('2024-01-01T10:00:00Z'),
      },
    ];
    const response = createMockAgentResponse({ toolCalls });
    const mapped = mapResponseForOutput(response);

    expect(mapped.toolCalls).toHaveLength(1);
    expect(mapped.toolCalls![0]).toEqual({
      toolName: 'web_search',
      timestamp: new Date('2024-01-01T10:00:00Z'),
    });
    // Should NOT include input/output
    expect(mapped.toolCalls![0]).not.toHaveProperty('input');
    expect(mapped.toolCalls![0]).not.toHaveProperty('output');
  });

  it('should not include agentId or agentName', () => {
    const response = createMockAgentResponse();
    const mapped = mapResponseForOutput(response) as Record<string, unknown>;

    expect(mapped).not.toHaveProperty('agentId');
    expect(mapped).not.toHaveProperty('agentName');
  });
});

describe('mapResponseWithAgentForOutput', () => {
  it('should include agentId and agentName', () => {
    const response = createMockAgentResponse({
      agentId: 'claude-1',
      agentName: 'Claude',
    });
    const mapped = mapResponseWithAgentForOutput(response);

    expect(mapped.agentId).toBe('claude-1');
    expect(mapped.agentName).toBe('Claude');
  });

  it('should include stance when present', () => {
    const response = createMockAgentResponse({ stance: 'YES' });
    const mapped = mapResponseWithAgentForOutput(response);

    expect(mapped.stance).toBe('YES');
  });

  it('should include all base mapped fields', () => {
    const response = createMockAgentResponse();
    const mapped = mapResponseWithAgentForOutput(response);

    expect(mapped.position).toBe(response.position);
    expect(mapped.reasoning).toBe(response.reasoning);
    expect(mapped.confidence).toBe(response.confidence);
  });
});

describe('getSessionOrError', () => {
  it('should return session when found', async () => {
    const mockSession: Session = {
      id: 'session-1',
      topic: 'Test topic',
      mode: 'collaborative',
      agentIds: ['agent-1'],
      status: 'active',
      currentRound: 1,
      totalRounds: 3,
      responses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mockSessionManager = {
      getSession: vi.fn().mockResolvedValue(mockSession),
    } as unknown as SessionManager;

    const result = await getSessionOrError(mockSessionManager, 'session-1');

    expect(result).toHaveProperty('session');
    expect((result as { session: Session }).session).toBe(mockSession);
  });

  it('should return error when session not found', async () => {
    const mockSessionManager = {
      getSession: vi.fn().mockResolvedValue(null),
    } as unknown as SessionManager;

    const result = await getSessionOrError(mockSessionManager, 'nonexistent');

    expect(result).toHaveProperty('error');
    expect(isSessionError(result)).toBe(true);
  });
});

describe('isSessionError', () => {
  it('should return true for error result', () => {
    const result = { error: { content: [], isError: true } };
    expect(isSessionError(result as any)).toBe(true);
  });

  it('should return false for session result', () => {
    const result = {
      session: {
        id: 'test',
        topic: 'test',
        mode: 'collaborative' as const,
        agentIds: [],
        status: 'active' as const,
        currentRound: 1,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    expect(isSessionError(result)).toBe(false);
  });
});

describe('groupResponsesByRound', () => {
  it('should group responses by round number', () => {
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1' }),
      createMockAgentResponse({ agentId: 'agent-2' }),
      createMockAgentResponse({ agentId: 'agent-1' }),
      createMockAgentResponse({ agentId: 'agent-2' }),
    ];

    const grouped = groupResponsesByRound(responses, 2);

    expect(grouped.size).toBe(2);
    expect(grouped.get(1)?.length).toBe(2);
    expect(grouped.get(2)?.length).toBe(2);
  });

  it('should handle empty responses', () => {
    const grouped = groupResponsesByRound([], 2);
    expect(grouped.size).toBe(0);
  });

  it('should handle single agent per round', () => {
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1' }),
      createMockAgentResponse({ agentId: 'agent-1' }),
      createMockAgentResponse({ agentId: 'agent-1' }),
    ];

    const grouped = groupResponsesByRound(responses, 1);

    expect(grouped.size).toBe(3);
    expect(grouped.get(1)?.length).toBe(1);
    expect(grouped.get(2)?.length).toBe(1);
    expect(grouped.get(3)?.length).toBe(1);
  });
});

describe('wrapError', () => {
  it('should return Error instance as-is', () => {
    const error = new Error('test error');
    expect(wrapError(error)).toBe(error);
  });

  it('should wrap string as Error', () => {
    const result = wrapError('string error');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('string error');
  });

  it('should wrap object with message property', () => {
    const result = wrapError({ message: 'object error' });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('object error');
  });

  it('should wrap other values as string', () => {
    const result = wrapError(123);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('123');
  });
});
