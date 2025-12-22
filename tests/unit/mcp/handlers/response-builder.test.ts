/**
 * Tests for MCP Response Builder modules
 */

import { describe, it, expect } from 'vitest';
import {
  classifyConsensusLevel,
  determineActionRecommendation,
  extractKeyPoints,
  detectConflicts,
  buildVerificationHints,
  buildRoundtableResponse,
} from '../../../../src/mcp/handlers/response-builder/index.js';
import type { AgentResponse, Session, RoundResult } from '../../../../src/types/index.js';

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
 * Helper to create a mock session
 */
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    topic: 'AI Regulation',
    mode: 'collaborative',
    agentIds: ['agent-1', 'agent-2'],
    status: 'active',
    currentRound: 1,
    totalRounds: 3,
    responses: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Decision Layer', () => {
  describe('classifyConsensusLevel', () => {
    it('should return "high" for score >= 0.7', () => {
      expect(classifyConsensusLevel(0.7)).toBe('high');
      expect(classifyConsensusLevel(0.85)).toBe('high');
      expect(classifyConsensusLevel(1.0)).toBe('high');
    });

    it('should return "medium" for score >= 0.4 and < 0.7', () => {
      expect(classifyConsensusLevel(0.4)).toBe('medium');
      expect(classifyConsensusLevel(0.5)).toBe('medium');
      expect(classifyConsensusLevel(0.69)).toBe('medium');
    });

    it('should return "low" for score < 0.4', () => {
      expect(classifyConsensusLevel(0.0)).toBe('low');
      expect(classifyConsensusLevel(0.2)).toBe('low');
      expect(classifyConsensusLevel(0.39)).toBe('low');
    });
  });

  describe('determineActionRecommendation', () => {
    it('should recommend "proceed" for high confidence and high consensus', () => {
      const result = determineActionRecommendation('high', 0.85, 0);

      expect(result.type).toBe('proceed');
      expect(result.reason).toContain('High consensus');
    });

    it('should recommend "verify" for multiple conflicts', () => {
      const result = determineActionRecommendation('medium', 0.7, 2);

      expect(result.type).toBe('verify');
      expect(result.reason).toContain('conflict');
    });

    it('should recommend "verify" for low confidence with conflicts', () => {
      const result = determineActionRecommendation('medium', 0.5, 1);

      expect(result.type).toBe('verify');
    });

    it('should recommend "query_detail" for low confidence', () => {
      const result = determineActionRecommendation('medium', 0.4, 0);

      expect(result.type).toBe('query_detail');
      expect(result.reason).toContain('Low confidence');
    });

    it('should recommend "query_detail" for low consensus', () => {
      const result = determineActionRecommendation('low', 0.7, 0);

      expect(result.type).toBe('query_detail');
    });

    it('should default to "proceed" for moderate conditions', () => {
      const result = determineActionRecommendation('medium', 0.65, 0);

      expect(result.type).toBe('proceed');
      expect(result.reason).toContain('Moderate consensus');
    });
  });
});

describe('Analysis Layer', () => {
  describe('extractKeyPoints', () => {
    it('should extract numbered points from reasoning', () => {
      const reasoning = `
1. First important point about the topic
2. Second key consideration to keep in mind
3. Third aspect worth noting
      `;

      const keyPoints = extractKeyPoints(reasoning);

      expect(keyPoints.length).toBeGreaterThan(0);
      expect(keyPoints.length).toBeLessThanOrEqual(3);
    });

    it('should extract bullet points', () => {
      const reasoning = `
* First bullet point with details
- Second bullet with more info
* Third point to consider
      `;

      const keyPoints = extractKeyPoints(reasoning);

      expect(keyPoints.length).toBeGreaterThan(0);
    });

    it('should fallback to sentences when no bullet points', () => {
      const reasoning =
        'This is the first sentence with important details. This is another sentence that contains relevant information. A third sentence with more context.';

      const keyPoints = extractKeyPoints(reasoning);

      expect(keyPoints.length).toBeGreaterThan(0);
    });

    it('should return at least one key point', () => {
      const keyPoints = extractKeyPoints('Short text');

      expect(keyPoints.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty reasoning', () => {
      const keyPoints = extractKeyPoints('');

      expect(keyPoints.length).toBe(1);
      expect(keyPoints[0]).toBe('No reasoning provided');
    });
  });

  describe('detectConflicts', () => {
    it('should return empty array for single response', () => {
      const responses = [createMockAgentResponse()];

      const conflicts = detectConflicts(responses);

      expect(conflicts).toEqual([]);
    });

    it('should detect confidence variance as conflict', () => {
      const responses = [
        createMockAgentResponse({ agentId: 'agent-1', confidence: 0.9 }),
        createMockAgentResponse({ agentId: 'agent-2', confidence: 0.4 }),
      ];

      const conflicts = detectConflicts(responses);

      expect(conflicts.length).toBeGreaterThan(0);
      const confidenceConflict = conflicts.find((c) => c.issue === 'Confidence levels');
      expect(confidenceConflict).toBeDefined();
    });

    it('should detect opposing stances', () => {
      const responses = [
        createMockAgentResponse({
          agentId: 'agent-1',
          position: 'This proposal is better for everyone',
          confidence: 0.8,
        }),
        createMockAgentResponse({
          agentId: 'agent-2',
          position: 'This proposal is worse for everyone',
          confidence: 0.8,
        }),
      ];

      const conflicts = detectConflicts(responses);

      const stanceConflict = conflicts.find((c) => c.issue === 'better vs worse');
      expect(stanceConflict).toBeDefined();
    });

    it('should limit conflicts to 3', () => {
      const responses = [
        createMockAgentResponse({
          agentId: 'agent-1',
          position: 'Yes, I agree this is better and positive',
          confidence: 0.95,
        }),
        createMockAgentResponse({
          agentId: 'agent-2',
          position: 'No, I disagree this is worse and negative',
          confidence: 0.3,
        }),
      ];

      const conflicts = detectConflicts(responses);

      expect(conflicts.length).toBeLessThanOrEqual(3);
    });
  });
});

describe('Metadata Layer', () => {
  describe('buildVerificationHints', () => {
    it('should add hint for low confidence agents', () => {
      const responses = [
        createMockAgentResponse({ agentId: 'agent-1', confidence: 0.5 }),
        createMockAgentResponse({ agentId: 'agent-2', confidence: 0.9 }),
      ];

      const hints = buildVerificationHints(responses, 'session-1');

      const confidenceHint = hints.find((h) => h.field === 'Agent confidence');
      expect(confidenceHint).toBeDefined();
      expect(confidenceHint?.suggestedTool).toBe('get_thoughts');
    });

    it('should add hint for missing citations', () => {
      const responses = [
        createMockAgentResponse({
          agentId: 'agent-1',
          citations: [{ url: 'https://example.com', title: 'Source', snippet: '' }],
        }),
        createMockAgentResponse({ agentId: 'agent-2', citations: [] }),
      ];

      const hints = buildVerificationHints(responses, 'session-1');

      const citationHint = hints.find((h) => h.field === 'Evidence sources');
      expect(citationHint).toBeDefined();
      expect(citationHint?.suggestedTool).toBe('get_citations');
    });

    it('should add hint for short reasoning', () => {
      const responses = [
        createMockAgentResponse({
          agentId: 'agent-1',
          reasoning:
            'This is a very long reasoning that goes into great detail about the topic at hand.',
        }),
        createMockAgentResponse({ agentId: 'agent-2', reasoning: 'Short.' }),
      ];

      const hints = buildVerificationHints(responses, 'session-1');

      const reasoningHint = hints.find((h) => h.field === 'Reasoning depth');
      expect(reasoningHint).toBeDefined();
      expect(reasoningHint?.suggestedTool).toBe('get_round_details');
    });

    it('should limit hints to 3', () => {
      const responses = [
        createMockAgentResponse({
          agentId: 'agent-1',
          confidence: 0.5,
          citations: [],
          reasoning: 'Short',
        }),
        createMockAgentResponse({
          agentId: 'agent-2',
          confidence: 0.9,
          citations: [{ url: 'https://x.com', title: 'X', snippet: '' }],
          reasoning:
            'Very long reasoning that provides substantial detail about the topic being discussed.',
        }),
      ];

      const hints = buildVerificationHints(responses, 'session-1');

      expect(hints.length).toBeLessThanOrEqual(3);
    });
  });
});

describe('buildRoundtableResponse', () => {
  it('should build complete 4-layer response', () => {
    const session = createMockSession();
    const roundResult: RoundResult = {
      roundNumber: 1,
      responses: [
        createMockAgentResponse({ agentId: 'agent-1' }),
        createMockAgentResponse({ agentId: 'agent-2' }),
      ],
      consensus: {
        agreementLevel: 0.75,
        summary: 'Agents generally agree on the topic',
        keyPoints: ['Point 1', 'Point 2'],
      },
    };

    const response = buildRoundtableResponse(session, roundResult);

    // Check structure
    expect(response.sessionId).toBe(session.id);
    expect(response.topic).toBe(session.topic);
    expect(response.mode).toBe(session.mode);
    expect(response.roundNumber).toBe(1);

    // Layer 1: Decision
    expect(response.decision).toBeDefined();
    expect(response.decision.consensusLevel).toBe('high');
    expect(response.decision.agreementScore).toBe(0.75);
    expect(response.decision.actionRecommendation).toBeDefined();

    // Layer 2: Agent Responses
    expect(response.agentResponses).toHaveLength(2);
    expect(response.agentResponses[0].agentId).toBe('agent-1');

    // Layer 3: Evidence
    expect(response.evidence).toBeDefined();
    expect(response.evidence.consensusSummary).toBeDefined();

    // Layer 4: Metadata
    expect(response.metadata).toBeDefined();
    expect(response.metadata.detailReference.tool).toBe('get_round_details');
  });

  it('should use AI-extracted key points when available', () => {
    const session = createMockSession();
    const roundResult: RoundResult = {
      roundNumber: 1,
      responses: [createMockAgentResponse({ agentId: 'agent-1' })],
      consensus: { agreementLevel: 0.8, summary: 'Summary', keyPoints: [] },
    };
    const keyPointsMap = new Map([['agent-1', ['AI key point 1', 'AI key point 2']]]);

    const response = buildRoundtableResponse(session, roundResult, [], keyPointsMap);

    expect(response.agentResponses[0].keyPoints).toContain('AI key point 1');
    expect(response.agentResponses[0].keyPoints).toContain('AI key point 2');
  });

  it('should calculate confidence change from previous responses', () => {
    const session = createMockSession({ currentRound: 2 });
    const roundResult: RoundResult = {
      roundNumber: 2,
      responses: [createMockAgentResponse({ agentId: 'agent-1', confidence: 0.9 })],
      consensus: { agreementLevel: 0.8, summary: 'Summary', keyPoints: [] },
    };
    const previousResponses = [createMockAgentResponse({ agentId: 'agent-1', confidence: 0.7 })];

    const response = buildRoundtableResponse(session, roundResult, previousResponses);

    expect(response.agentResponses[0].confidenceChange).toBeDefined();
    expect(response.agentResponses[0].confidenceChange?.delta).toBeCloseTo(0.2);
  });

  it('should set status to "needs_context" when required context requests exist', () => {
    const session = createMockSession();
    const roundResult: RoundResult = {
      roundNumber: 1,
      responses: [createMockAgentResponse()],
      consensus: { agreementLevel: 0.8, summary: 'Summary', keyPoints: [] },
    };
    const contextRequests = [
      { query: 'Need more info', agentId: 'agent-1', priority: 'required' as const },
    ];

    const response = buildRoundtableResponse(session, roundResult, [], new Map(), contextRequests);

    expect(response.status).toBe('needs_context');
    expect(response.contextRequests).toHaveLength(1);
  });

  it('should set status to "completed" when at final round', () => {
    const session = createMockSession({ currentRound: 3, totalRounds: 3 });
    const roundResult: RoundResult = {
      roundNumber: 3,
      responses: [createMockAgentResponse()],
      consensus: { agreementLevel: 0.8, summary: 'Summary', keyPoints: [] },
    };

    const response = buildRoundtableResponse(session, roundResult);

    expect(response.status).toBe('completed');
  });

  it('should set status to "in_progress" for intermediate rounds', () => {
    const session = createMockSession({ currentRound: 2, totalRounds: 5 });
    const roundResult: RoundResult = {
      roundNumber: 2,
      responses: [createMockAgentResponse()],
      consensus: { agreementLevel: 0.8, summary: 'Summary', keyPoints: [] },
    };

    const response = buildRoundtableResponse(session, roundResult);

    expect(response.status).toBe('in_progress');
  });

  it('should count evidence used correctly', () => {
    const session = createMockSession();
    const roundResult: RoundResult = {
      roundNumber: 1,
      responses: [
        createMockAgentResponse({
          agentId: 'agent-1',
          citations: [{ url: 'https://a.com', title: 'A', snippet: '' }],
          toolCalls: [
            { toolName: 'web_search', input: {}, output: {}, timestamp: new Date() },
            { toolName: 'fact_check', input: {}, output: {}, timestamp: new Date() },
          ],
        }),
      ],
      consensus: { agreementLevel: 0.8, summary: 'Summary', keyPoints: [] },
    };

    const response = buildRoundtableResponse(session, roundResult);

    expect(response.agentResponses[0].evidenceUsed.citations).toBe(1);
    expect(response.agentResponses[0].evidenceUsed.webSearches).toBe(1);
    expect(response.agentResponses[0].evidenceUsed.toolCalls).toContain('web_search');
    expect(response.agentResponses[0].evidenceUsed.toolCalls).toContain('fact_check');
  });
});
