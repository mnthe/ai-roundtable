import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SessionManagerAdapter,
  createSessionManagerAdapter,
} from '../../../../src/tools/providers/session-data-provider.js';
import type { SessionManager } from '../../../../src/core/session-manager.js';
import type { AgentResponse } from '../../../../src/types/index.js';

describe('SessionManagerAdapter', () => {
  let mockSessionManager: {
    getResponses: ReturnType<typeof vi.fn>;
  };
  let adapter: SessionManagerAdapter;

  const mockResponses: AgentResponse[] = [
    {
      agentId: 'agent-1',
      agentName: 'Claude',
      position: 'AI should be regulated',
      reasoning: 'For safety and accountability',
      confidence: 0.85,
      timestamp: new Date('2025-01-01T00:00:00Z'),
    },
    {
      agentId: 'agent-2',
      agentName: 'ChatGPT',
      position: 'Light regulation is preferable',
      reasoning: 'Balance innovation and safety',
      confidence: 0.75,
      timestamp: new Date('2025-01-01T00:01:00Z'),
    },
    {
      agentId: 'agent-3',
      agentName: 'Gemini',
      position: 'Industry self-regulation first',
      reasoning: 'Government may not understand technology',
      confidence: 0.7,
      timestamp: new Date('2025-01-01T00:02:00Z'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = {
      getResponses: vi.fn(),
    };
    adapter = new SessionManagerAdapter(mockSessionManager as unknown as SessionManager);
  });

  describe('getDebateEvidence', () => {
    it('should return all evidence from session responses', async () => {
      mockSessionManager.getResponses.mockResolvedValue(mockResponses);

      const evidence = await adapter.getDebateEvidence('session-123');

      expect(mockSessionManager.getResponses).toHaveBeenCalledWith('session-123');
      expect(evidence).toHaveLength(3);
    });

    it('should transform responses to evidence format', async () => {
      mockSessionManager.getResponses.mockResolvedValue(mockResponses);

      const evidence = await adapter.getDebateEvidence('session-123');

      expect(evidence[0]).toEqual({
        agentId: 'agent-1',
        agentName: 'Claude',
        position: 'AI should be regulated',
        reasoning: 'For safety and accountability',
        confidence: 0.85,
      });
    });

    it('should exclude non-evidence fields from responses', async () => {
      const responseWithExtraFields: AgentResponse[] = [
        {
          agentId: 'agent-1',
          agentName: 'Claude',
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
          citations: [{ title: 'Source', url: 'https://example.com' }],
          toolCalls: [{ toolName: 'search', input: {}, output: {}, timestamp: new Date() }],
          stance: 'YES',
        },
      ];

      mockSessionManager.getResponses.mockResolvedValue(responseWithExtraFields);

      const evidence = await adapter.getDebateEvidence('session-123');

      expect(evidence[0]).toEqual({
        agentId: 'agent-1',
        agentName: 'Claude',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.8,
      });
      // Ensure extra fields are not included
      expect(evidence[0]).not.toHaveProperty('timestamp');
      expect(evidence[0]).not.toHaveProperty('citations');
      expect(evidence[0]).not.toHaveProperty('toolCalls');
      expect(evidence[0]).not.toHaveProperty('stance');
    });

    it('should return empty array for session with no responses', async () => {
      mockSessionManager.getResponses.mockResolvedValue([]);

      const evidence = await adapter.getDebateEvidence('empty-session');

      expect(evidence).toEqual([]);
    });

    it('should propagate errors from SessionManager', async () => {
      mockSessionManager.getResponses.mockRejectedValue(new Error('Session not found'));

      await expect(adapter.getDebateEvidence('invalid-session')).rejects.toThrow(
        'Session not found'
      );
    });
  });
});

describe('createSessionManagerAdapter', () => {
  it('should create adapter from SessionManager', () => {
    const mockSessionManager = {
      getResponses: vi.fn(),
    };

    const adapter = createSessionManagerAdapter(
      mockSessionManager as unknown as SessionManager
    );

    expect(adapter).toBeInstanceOf(SessionManagerAdapter);
  });

  it('should return SessionDataProvider interface', async () => {
    const mockSessionManager = {
      getResponses: vi.fn().mockResolvedValue([]),
    };

    const provider = createSessionManagerAdapter(
      mockSessionManager as unknown as SessionManager
    );

    // Should have getDebateEvidence method
    expect(typeof provider.getDebateEvidence).toBe('function');

    // Should be callable
    const result = await provider.getDebateEvidence('test');
    expect(result).toEqual([]);
  });
});
