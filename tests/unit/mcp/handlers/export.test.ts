/**
 * Tests for MCP export handlers
 * Handles: export_session, synthesize_debate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleExportSession, handleSynthesizeDebate } from '../../../../src/mcp/handlers/export.js';
import type { SessionManager } from '../../../../src/core/session-manager.js';
import type { AgentRegistry } from '../../../../src/agents/registry.js';
import type {
  Session,
  AgentResponse,
  Citation,
  ConsensusAnalysis,
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
 * Helper to create mock tool call records
 */
function createMockToolCallRecord(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    toolName: 'web_search',
    input: { query: 'AI regulation' },
    output: { results: [] },
    timestamp: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Helper to create a mock consensus analysis
 */
function createMockConsensus(overrides: Partial<ConsensusAnalysis> = {}): ConsensusAnalysis {
  return {
    agreementLevel: 0.75,
    commonGround: ['Safety is important', 'Oversight is needed'],
    disagreementPoints: ['Implementation approach'],
    summary: 'Agents largely agree on the need for regulation.',
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
  };
}

/**
 * Create mock AgentRegistry
 */
function createMockAgentRegistry() {
  return {
    getAgent: vi.fn(),
    getActiveAgentIds: vi.fn(),
  };
}

/**
 * Create mock agent with info
 */
function createMockAgent(id: string, name: string, provider: string, model: string) {
  return {
    id,
    getInfo: vi.fn().mockReturnValue({ id, name, provider, model }),
    generateSynthesis: vi.fn(),
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

describe('handleExportSession', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;
  let mockAgentRegistry: ReturnType<typeof createMockAgentRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
    mockAgentRegistry = createMockAgentRegistry();
  });

  describe('JSON format', () => {
    it('should export session to JSON format', async () => {
      const session = createMockSession();
      const responses = [
        createMockAgentResponse({ agentId: 'agent-1', agentName: 'Claude' }),
        createMockAgentResponse({
          agentId: 'agent-2',
          agentName: 'ChatGPT',
          position: 'Minimal regulation is sufficient',
        }),
      ];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const agent1 = createMockAgent('agent-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');
      const agent2 = createMockAgent('agent-2', 'ChatGPT', 'openai', 'gpt-5.2');
      mockAgentRegistry.getAgent.mockImplementation((id: string) => {
        if (id === 'agent-1') return agent1;
        if (id === 'agent-2') return agent2;
        return null;
      });

      const result = await handleExportSession(
        { sessionId: 'session-1', format: 'json' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;

      // Verify session info
      expect(parsed).toHaveProperty('session');
      const exportedSession = parsed.session as Record<string, unknown>;
      expect(exportedSession.id).toBe('session-1');
      expect(exportedSession.topic).toBe('Should AI be regulated?');
      expect(exportedSession.mode).toBe('collaborative');
      expect(exportedSession.status).toBe('active');

      // Verify agents
      expect(parsed).toHaveProperty('agents');
      const agents = parsed.agents as Array<Record<string, unknown>>;
      expect(agents).toHaveLength(2);
      expect(agents[0]).toEqual({
        id: 'agent-1',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      });

      // Verify responses
      expect(parsed).toHaveProperty('responses');
      const exportedResponses = parsed.responses as Array<Record<string, unknown>>;
      expect(exportedResponses).toHaveLength(2);
      expect(exportedResponses[0].agentId).toBe('agent-1');
      expect(exportedResponses[1].agentId).toBe('agent-2');
    });

    it('should include consensus in JSON export when available', async () => {
      const consensus = createMockConsensus();
      const session = createMockSession({ consensus });
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const agent = createMockAgent('agent-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');
      mockAgentRegistry.getAgent.mockReturnValue(agent);

      const result = await handleExportSession(
        { sessionId: 'session-1', format: 'json' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('consensus');
      const exportedConsensus = parsed.consensus as Record<string, unknown>;
      expect(exportedConsensus.agreementLevel).toBe(0.75);
      expect(exportedConsensus.commonGround).toEqual(['Safety is important', 'Oversight is needed']);
    });

    it('should handle unknown agents gracefully', async () => {
      const session = createMockSession();
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);
      mockAgentRegistry.getAgent.mockReturnValue(null);

      const result = await handleExportSession(
        { sessionId: 'session-1', format: 'json' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      const agents = parsed.agents as Array<Record<string, unknown>>;
      expect(agents[0]).toEqual({
        id: 'agent-1',
        name: 'Unknown',
        provider: 'unknown',
        model: 'unknown',
      });
    });
  });

  describe('Markdown format', () => {
    it('should export session to markdown format', async () => {
      const session = createMockSession();
      const responses = [
        createMockAgentResponse({ agentId: 'agent-1', agentName: 'Claude' }),
        createMockAgentResponse({
          agentId: 'agent-2',
          agentName: 'ChatGPT',
          position: 'Minimal regulation is sufficient',
        }),
      ];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const agent1 = createMockAgent('agent-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');
      const agent2 = createMockAgent('agent-2', 'ChatGPT', 'openai', 'gpt-5.2');
      mockAgentRegistry.getAgent.mockImplementation((id: string) => {
        if (id === 'agent-1') return agent1;
        if (id === 'agent-2') return agent2;
        return null;
      });

      const result = await handleExportSession(
        { sessionId: 'session-1', format: 'markdown' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed.format).toBe('markdown');
      expect(parsed).toHaveProperty('content');

      const content = parsed.content as string;

      // Verify title
      expect(content).toContain('# Debate Session: Should AI be regulated?');

      // Verify session information
      expect(content).toContain('## Session Information');
      expect(content).toContain('**Session ID:** session-1');
      expect(content).toContain('**Mode:** collaborative');
      expect(content).toContain('**Status:** active');

      // Verify participants
      expect(content).toContain('## Participants');
      expect(content).toContain('**Claude** (anthropic / claude-sonnet-4-5)');
      expect(content).toContain('**ChatGPT** (openai / gpt-5.2)');

      // Verify responses
      expect(content).toContain('## Round 1');
      expect(content).toContain('### Claude');
      expect(content).toContain('**Position:** AI should be regulated for safety');
      expect(content).toContain('**Confidence:** 85.0%');
    });

    it('should include citations in markdown export', async () => {
      const citations = [
        createMockCitation({ title: 'AI Safety Paper', url: 'https://example.com/paper' }),
      ];
      const session = createMockSession({ agentIds: ['agent-1'] });
      const responses = [createMockAgentResponse({ citations })];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const agent = createMockAgent('agent-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');
      mockAgentRegistry.getAgent.mockReturnValue(agent);

      const result = await handleExportSession(
        { sessionId: 'session-1', format: 'markdown' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      const content = parsed.content as string;

      expect(content).toContain('**Citations:**');
      expect(content).toContain('[AI Safety Paper](https://example.com/paper)');
    });

    it('should include tool usage in markdown export', async () => {
      const toolCalls = [createMockToolCallRecord({ toolName: 'web_search' })];
      const session = createMockSession({ agentIds: ['agent-1'] });
      const responses = [createMockAgentResponse({ toolCalls })];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const agent = createMockAgent('agent-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');
      mockAgentRegistry.getAgent.mockReturnValue(agent);

      const result = await handleExportSession(
        { sessionId: 'session-1', format: 'markdown' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      const content = parsed.content as string;

      expect(content).toContain('**Tools Used:** web_search');
    });

    it('should include consensus analysis in markdown export', async () => {
      const consensus = createMockConsensus();
      const session = createMockSession({ agentIds: ['agent-1'], consensus });
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const agent = createMockAgent('agent-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');
      mockAgentRegistry.getAgent.mockReturnValue(agent);

      const result = await handleExportSession(
        { sessionId: 'session-1', format: 'markdown' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      const content = parsed.content as string;

      expect(content).toContain('## Consensus Analysis');
      expect(content).toContain('**Agreement Level:** 75.0%');
      expect(content).toContain('**Common Ground:**');
      expect(content).toContain('- Safety is important');
      expect(content).toContain('**Disagreement Points:**');
      expect(content).toContain('- Implementation approach');
      expect(content).toContain('**Summary:**');
    });

    it('should default to markdown format when not specified', async () => {
      const session = createMockSession();
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const agent = createMockAgent('agent-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');
      mockAgentRegistry.getAgent.mockReturnValue(agent);

      const result = await handleExportSession(
        { sessionId: 'session-1' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed.format).toBe('markdown');
    });
  });

  describe('Error handling', () => {
    it('should return error for missing session', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      const result = await handleExportSession(
        { sessionId: 'non-existent' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Session "non-existent" not found');
    });

    it('should handle session with no responses', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue([]);

      const agent = createMockAgent('agent-1', 'Claude', 'anthropic', 'claude-sonnet-4-5');
      mockAgentRegistry.getAgent.mockReturnValue(agent);

      const result = await handleExportSession(
        { sessionId: 'session-1', format: 'json' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed.responses).toEqual([]);
    });

    it('should handle invalid input', async () => {
      const result = await handleExportSession(
        { sessionId: '' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
    });
  });
});

describe('handleSynthesizeDebate', () => {
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;
  let mockAgentRegistry: ReturnType<typeof createMockAgentRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
    mockAgentRegistry = createMockAgentRegistry();
  });

  it('should synthesize debate with specified synthesizer', async () => {
    const session = createMockSession();
    const responses = [
      createMockAgentResponse({ agentId: 'agent-1', agentName: 'Claude' }),
      createMockAgentResponse({ agentId: 'agent-2', agentName: 'ChatGPT' }),
    ];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    const synthesisResponse = JSON.stringify({
      commonGround: ['Both agree on safety'],
      keyDifferences: ['Different approaches'],
      evolutionSummary: 'Positions evolved over rounds',
      conclusion: 'Consensus on regulation',
      recommendation: 'Implement safety standards',
      confidence: 0.85,
    });

    const synthesizerAgent = createMockAgent(
      'synth-1',
      'Synthesizer',
      'anthropic',
      'claude-sonnet-4-5'
    );
    synthesizerAgent.generateSynthesis.mockResolvedValue(synthesisResponse);
    mockAgentRegistry.getAgent.mockReturnValue(synthesizerAgent);

    const result = await handleSynthesizeDebate(
      { sessionId: 'session-1', synthesizer: 'synth-1' },
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry
    );

    const parsed = parseResponseContent(result) as Record<string, unknown>;
    expect(parsed.sessionId).toBe('session-1');
    expect(parsed.synthesizerId).toBe('synth-1');
    expect(parsed).toHaveProperty('synthesis');

    const synthesis = parsed.synthesis as Record<string, unknown>;
    expect(synthesis.commonGround).toEqual(['Both agree on safety']);
    expect(synthesis.keyDifferences).toEqual(['Different approaches']);
    expect(synthesis.conclusion).toBe('Consensus on regulation');
    expect(synthesis.confidence).toBe(0.85);
  });

  it('should use first active agent as default synthesizer', async () => {
    const session = createMockSession();
    const responses = [createMockAgentResponse()];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);
    mockAgentRegistry.getActiveAgentIds.mockReturnValue(['default-agent']);

    const synthesisResponse = JSON.stringify({
      commonGround: ['Agreement point'],
      keyDifferences: ['Difference'],
      evolutionSummary: 'Summary',
      conclusion: 'Conclusion',
      recommendation: 'Recommendation',
      confidence: 0.8,
    });

    const defaultAgent = createMockAgent(
      'default-agent',
      'Default',
      'anthropic',
      'claude-sonnet-4-5'
    );
    defaultAgent.generateSynthesis.mockResolvedValue(synthesisResponse);
    mockAgentRegistry.getAgent.mockReturnValue(defaultAgent);

    const result = await handleSynthesizeDebate(
      { sessionId: 'session-1' },
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry
    );

    const parsed = parseResponseContent(result) as Record<string, unknown>;
    expect(parsed.synthesizerId).toBe('default-agent');
    expect(mockAgentRegistry.getActiveAgentIds).toHaveBeenCalled();
  });

  it('should handle malformed JSON in synthesis response', async () => {
    const session = createMockSession();
    const responses = [createMockAgentResponse()];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    // Return plain text that's not valid JSON
    const plainTextResponse = 'This is a plain text summary without JSON structure.';

    const synthesizerAgent = createMockAgent(
      'synth-1',
      'Synthesizer',
      'anthropic',
      'claude-sonnet-4-5'
    );
    synthesizerAgent.generateSynthesis.mockResolvedValue(plainTextResponse);
    mockAgentRegistry.getAgent.mockReturnValue(synthesizerAgent);

    const result = await handleSynthesizeDebate(
      { sessionId: 'session-1', synthesizer: 'synth-1' },
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry
    );

    const parsed = parseResponseContent(result) as Record<string, unknown>;
    expect(parsed).toHaveProperty('synthesis');

    const synthesis = parsed.synthesis as Record<string, unknown>;
    // Should fall back to using the raw text as conclusion
    expect(synthesis.conclusion).toBe(plainTextResponse);
    expect(synthesis.confidence).toBe(0.5); // Default confidence for fallback
  });

  it('should handle JSON with trailing commas using jsonrepair', async () => {
    const session = createMockSession();
    const responses = [createMockAgentResponse()];

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.getResponses.mockResolvedValue(responses);

    // JSON with trailing comma (common AI mistake)
    const malformedJson = `{
      "commonGround": ["Point 1", "Point 2",],
      "keyDifferences": ["Diff 1"],
      "evolutionSummary": "Summary",
      "conclusion": "Conclusion",
      "recommendation": "Recommendation",
      "confidence": 0.9,
    }`;

    const synthesizerAgent = createMockAgent(
      'synth-1',
      'Synthesizer',
      'anthropic',
      'claude-sonnet-4-5'
    );
    synthesizerAgent.generateSynthesis.mockResolvedValue(malformedJson);
    mockAgentRegistry.getAgent.mockReturnValue(synthesizerAgent);

    const result = await handleSynthesizeDebate(
      { sessionId: 'session-1', synthesizer: 'synth-1' },
      mockSessionManager as unknown as SessionManager,
      mockAgentRegistry as unknown as AgentRegistry
    );

    const parsed = parseResponseContent(result) as Record<string, unknown>;
    expect(parsed).toHaveProperty('synthesis');

    const synthesis = parsed.synthesis as Record<string, unknown>;
    expect(synthesis.conclusion).toBe('Conclusion');
    expect(synthesis.confidence).toBe(0.9);
  });

  describe('Error handling', () => {
    it('should return error for missing session', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      const result = await handleSynthesizeDebate(
        { sessionId: 'non-existent' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Session "non-existent" not found');
    });

    it('should return error for session with no responses', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue([]);

      const result = await handleSynthesizeDebate(
        { sessionId: 'session-1' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('No responses found');
    });

    it('should return error when no active agents available', async () => {
      const session = createMockSession();
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);
      mockAgentRegistry.getActiveAgentIds.mockReturnValue([]);

      const result = await handleSynthesizeDebate(
        { sessionId: 'session-1' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('No active agents');
    });

    it('should return error when specified synthesizer not found', async () => {
      const session = createMockSession();
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);
      mockAgentRegistry.getAgent.mockReturnValue(null);

      const result = await handleSynthesizeDebate(
        { sessionId: 'session-1', synthesizer: 'unknown-agent' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Synthesizer agent "unknown-agent" not found');
    });

    it('should handle synthesis generation errors', async () => {
      const session = createMockSession();
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const synthesizerAgent = createMockAgent(
        'synth-1',
        'Synthesizer',
        'anthropic',
        'claude-sonnet-4-5'
      );
      synthesizerAgent.generateSynthesis.mockRejectedValue(new Error('API Error'));
      mockAgentRegistry.getAgent.mockReturnValue(synthesizerAgent);

      const result = await handleSynthesizeDebate(
        { sessionId: 'session-1', synthesizer: 'synth-1' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('API Error');
    });
  });

  describe('Confidence clamping', () => {
    it('should clamp confidence above 1 to 1', async () => {
      const session = createMockSession();
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const synthesisResponse = JSON.stringify({
        commonGround: [],
        keyDifferences: [],
        evolutionSummary: 'Summary',
        conclusion: 'Conclusion',
        recommendation: 'Recommendation',
        confidence: 1.5, // Invalid: above 1
      });

      const synthesizerAgent = createMockAgent('synth-1', 'Synthesizer', 'anthropic', 'claude-4');
      synthesizerAgent.generateSynthesis.mockResolvedValue(synthesisResponse);
      mockAgentRegistry.getAgent.mockReturnValue(synthesizerAgent);

      const result = await handleSynthesizeDebate(
        { sessionId: 'session-1', synthesizer: 'synth-1' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      const synthesis = parsed.synthesis as Record<string, unknown>;
      expect(synthesis.confidence).toBe(1);
    });

    it('should clamp confidence below 0 to 0', async () => {
      const session = createMockSession();
      const responses = [createMockAgentResponse()];

      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.getResponses.mockResolvedValue(responses);

      const synthesisResponse = JSON.stringify({
        commonGround: [],
        keyDifferences: [],
        evolutionSummary: 'Summary',
        conclusion: 'Conclusion',
        recommendation: 'Recommendation',
        confidence: -0.5, // Invalid: below 0
      });

      const synthesizerAgent = createMockAgent('synth-1', 'Synthesizer', 'anthropic', 'claude-4');
      synthesizerAgent.generateSynthesis.mockResolvedValue(synthesisResponse);
      mockAgentRegistry.getAgent.mockReturnValue(synthesizerAgent);

      const result = await handleSynthesizeDebate(
        { sessionId: 'session-1', synthesizer: 'synth-1' },
        mockSessionManager as unknown as SessionManager,
        mockAgentRegistry as unknown as AgentRegistry
      );

      const parsed = parseResponseContent(result) as Record<string, unknown>;
      const synthesis = parsed.synthesis as Record<string, unknown>;
      expect(synthesis.confidence).toBe(0);
    });
  });
});
