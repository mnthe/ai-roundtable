import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DefaultAgentToolkit,
  createDefaultToolkit,
  type SessionDataProvider,
} from '../../../src/tools/toolkit.js';
import type { DebateContext } from '../../../src/types/index.js';

describe('DefaultAgentToolkit', () => {
  let toolkit: DefaultAgentToolkit;

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Should AI be regulated?',
    mode: 'collaborative',
    currentRound: 2,
    totalRounds: 3,
    previousResponses: [
      {
        agentId: 'agent-1',
        agentName: 'Agent One',
        position: 'AI should be regulated',
        reasoning: 'For safety',
        confidence: 0.8,
        timestamp: new Date(),
      },
    ],
    focusQuestion: 'What about innovation?',
  };

  beforeEach(() => {
    toolkit = new DefaultAgentToolkit();
  });

  describe('getTools', () => {
    it('should return default tools', () => {
      const tools = toolkit.getTools();

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain('fact_check');
      expect(tools.map((t) => t.name)).toContain('request_context');
    });

    it('should have descriptions for all tools', () => {
      const tools = toolkit.getTools();

      for (const tool of tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('executeTool', () => {
    it('should return error for unknown tool', async () => {
      const result = await toolkit.executeTool('unknown_tool', {});

      expect(result).toEqual({
        success: false,
        error: 'Tool "unknown_tool" not found',
      });
    });
  });

  describe('fact_check tool', () => {
    it('should return error for missing claim', async () => {
      toolkit.setContext(defaultContext);

      const result = (await toolkit.executeTool('fact_check', {})) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('claim');
    });

    it('should return error when session context is not available', async () => {
      // No context set and no session data provider
      const result = (await toolkit.executeTool('fact_check', {
        claim: 'AI will replace all jobs',
        source_agent: 'Agent One',
      })) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session context not available for fact checking');
    });

    it('should return debate evidence excluding source agent', async () => {
      const mockSessionProvider: SessionDataProvider = {
        getDebateEvidence: vi.fn().mockResolvedValue([
          {
            agentId: 'agent-1',
            agentName: 'Claude',
            position: 'Position 1',
            reasoning: 'Reasoning 1',
            confidence: 0.8,
          },
          {
            agentId: 'agent-2',
            agentName: 'ChatGPT',
            position: 'Position 2',
            reasoning: 'Reasoning 2',
            confidence: 0.7,
          },
        ]),
      };

      const toolkitWithSession = new DefaultAgentToolkit(mockSessionProvider);
      toolkitWithSession.setContext(defaultContext);

      const result = (await toolkitWithSession.executeTool('fact_check', {
        claim: 'Test claim',
        source_agent: 'agent-1',
      })) as {
        success: boolean;
        data?: {
          claim: string;
          sourceAgent: string;
          debateEvidence: Array<{
            agentId: string;
            agentName: string;
            position: string;
            reasoning: string;
            confidence: number;
          }>;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data?.claim).toBe('Test claim');
      expect(result.data?.sourceAgent).toBe('agent-1');
      expect(result.data?.debateEvidence).toHaveLength(1);
      expect(result.data?.debateEvidence[0]?.agentId).toBe('agent-2');
      expect(mockSessionProvider.getDebateEvidence).toHaveBeenCalledWith('session-1');
    });

    it('should exclude by agent name as well', async () => {
      const mockSessionProvider: SessionDataProvider = {
        getDebateEvidence: vi.fn().mockResolvedValue([
          {
            agentId: 'agent-1',
            agentName: 'Claude',
            position: 'Position 1',
            reasoning: 'Reasoning 1',
            confidence: 0.8,
          },
          {
            agentId: 'agent-2',
            agentName: 'ChatGPT',
            position: 'Position 2',
            reasoning: 'Reasoning 2',
            confidence: 0.7,
          },
        ]),
      };

      const toolkitWithSession = new DefaultAgentToolkit(mockSessionProvider);
      toolkitWithSession.setContext(defaultContext);

      const result = (await toolkitWithSession.executeTool('fact_check', {
        claim: 'Test claim',
        source_agent: 'Claude',
      })) as {
        success: boolean;
        data?: {
          debateEvidence: Array<{ agentName: string }>;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data?.debateEvidence).toHaveLength(1);
      expect(result.data?.debateEvidence[0]?.agentName).toBe('ChatGPT');
    });

    it('should reject empty claim string', async () => {
      toolkit.setContext(defaultContext);

      const result = (await toolkit.executeTool('fact_check', {
        claim: '',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('claim');
    });

    it('should use default source_agent when not provided', async () => {
      const mockSessionProvider: SessionDataProvider = {
        getDebateEvidence: vi.fn().mockResolvedValue([]),
      };

      const toolkitWithSession = new DefaultAgentToolkit(mockSessionProvider);
      toolkitWithSession.setContext(defaultContext);

      const result = (await toolkitWithSession.executeTool('fact_check', {
        claim: 'Test claim',
      })) as {
        success: boolean;
        data?: { sourceAgent: string };
      };

      expect(result.success).toBe(true);
      expect(result.data?.sourceAgent).toBe('unknown');
    });
  });

  describe('registerTool', () => {
    it('should allow registering custom tools', async () => {
      toolkit.registerTool({
        tool: {
          name: 'custom_tool',
          description: 'A custom tool',
          parameters: { input: { type: 'string' } },
        },
        executor: async (input) => ({
          success: true,
          data: { received: input },
        }),
      });

      const tools = toolkit.getTools();
      expect(tools.map((t) => t.name)).toContain('custom_tool');

      const result = (await toolkit.executeTool('custom_tool', {
        test: 'value',
      })) as {
        success: boolean;
        data?: { received: unknown };
      };

      expect(result.success).toBe(true);
      expect(result.data?.received).toEqual({ test: 'value' });
    });
  });
});

describe('createDefaultToolkit', () => {
  it('should create toolkit without providers', () => {
    const toolkit = createDefaultToolkit();
    expect(toolkit.getTools()).toHaveLength(2);
  });

  it('should create toolkit with session data provider', () => {
    const mockSessionProvider: SessionDataProvider = {
      getDebateEvidence: vi.fn(),
    };

    const toolkit = createDefaultToolkit(mockSessionProvider);
    expect(toolkit.getTools()).toHaveLength(2);
  });
});

describe('request_context tool', () => {
  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'AI regulation',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  it('should reject request_context on final round', async () => {
    const toolkit = new DefaultAgentToolkit();
    const finalRoundContext: DebateContext = {
      ...defaultContext,
      currentRound: 3,
      totalRounds: 3,
    };
    toolkit.setContext(finalRoundContext);

    const result = (await toolkit.executeTool(
      'request_context',
      {
        query: 'Need more information',
        reason: 'To complete analysis',
        priority: 'required',
      },
      'agent-1'
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot request context on the final round');
    expect(result.error).toContain('round 3 of 3');
    expect(toolkit.getPendingContextRequests()).toHaveLength(0);
  });

  it('should reject request_context when currentRound exceeds totalRounds', async () => {
    const toolkit = new DefaultAgentToolkit();
    const exceededRoundContext: DebateContext = {
      ...defaultContext,
      currentRound: 5,
      totalRounds: 3,
    };
    toolkit.setContext(exceededRoundContext);

    const result = (await toolkit.executeTool(
      'request_context',
      {
        query: 'Need more information',
        reason: 'To complete analysis',
      },
      'agent-1'
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot request context on the final round');
  });

  it('should allow request_context on non-final rounds', async () => {
    const toolkit = new DefaultAgentToolkit();
    const nonFinalContext: DebateContext = {
      ...defaultContext,
      currentRound: 2,
      totalRounds: 3,
    };
    toolkit.setContext(nonFinalContext);

    const result = (await toolkit.executeTool(
      'request_context',
      {
        query: 'Need more information',
        reason: 'To complete analysis',
        priority: 'required',
      },
      'agent-1'
    )) as { success: boolean; data?: { requestId: string } };

    expect(result.success).toBe(true);
    expect(result.data?.requestId).toBeDefined();
    expect(toolkit.getPendingContextRequests()).toHaveLength(1);
  });

  it('should create a context request with required priority', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool(
      'request_context',
      {
        query: 'What are the latest EU AI regulations?',
        reason: 'Need current regulatory context for accurate discussion',
        priority: 'required',
      },
      'agent-1'
    )) as { success: boolean; data?: { requestId: string; message: string } };

    expect(result.success).toBe(true);
    expect(result.data?.requestId).toBeDefined();
    expect(result.data?.requestId).toMatch(/^ctx-\d+-\d+$/);
    expect(result.data?.message).toContain('queued');
  });

  it('should create a context request with optional priority', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool(
      'request_context',
      {
        query: 'Historical examples of AI regulation',
        reason: 'Would help but not essential',
        priority: 'optional',
      },
      'agent-1'
    )) as { success: boolean; data?: { requestId: string; message: string } };

    expect(result.success).toBe(true);
    expect(result.data?.requestId).toBeDefined();
  });

  it('should default to required priority when not specified', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    await toolkit.executeTool(
      'request_context',
      {
        query: 'Test query',
        reason: 'Test reason',
      },
      'agent-1'
    );

    const requests = toolkit.getPendingContextRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.priority).toBe('required');
  });

  it('should reject missing query', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('request_context', {
      reason: 'Need information',
      priority: 'required',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('query');
  });

  it('should reject empty query string', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('request_context', {
      query: '',
      reason: 'Need information',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('query');
  });

  it('should reject missing reason', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('request_context', {
      query: 'What is the current policy?',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('reason');
  });

  it('should reject empty reason string', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('request_context', {
      query: 'What is the current policy?',
      reason: '',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('reason');
  });

  it('should reject query exceeding max length', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('request_context', {
      query: 'a'.repeat(1001), // Max is 1000
      reason: 'Test reason',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('1000');
  });

  it('should reject reason exceeding max length', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('request_context', {
      query: 'Test query',
      reason: 'a'.repeat(501), // Max is 500
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('should reject invalid priority value', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('request_context', {
      query: 'Test query',
      reason: 'Test reason',
      priority: 'high', // Invalid - should be 'required' or 'optional'
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('priority');
  });

  it('should include agentId in context request', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    await toolkit.executeTool(
      'request_context',
      {
        query: 'Test query',
        reason: 'Test reason',
      },
      'test-agent-123'
    );

    const requests = toolkit.getPendingContextRequests();
    expect(requests[0]?.agentId).toBe('test-agent-123');
  });

  it('should include timestamp in context request', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const before = new Date();
    await toolkit.executeTool(
      'request_context',
      {
        query: 'Test query',
        reason: 'Test reason',
      },
      'agent-1'
    );
    const after = new Date();

    const requests = toolkit.getPendingContextRequests();
    const timestamp = requests[0]?.timestamp;
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('context request management', () => {
  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'AI regulation',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  it('should accumulate multiple context requests', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    await toolkit.executeTool(
      'request_context',
      {
        query: 'First query',
        reason: 'First reason',
      },
      'agent-1'
    );
    await toolkit.executeTool(
      'request_context',
      {
        query: 'Second query',
        reason: 'Second reason',
      },
      'agent-1'
    );

    const requests = toolkit.getPendingContextRequests();
    expect(requests).toHaveLength(2);
    expect(requests[0]?.query).toBe('First query');
    expect(requests[1]?.query).toBe('Second query');
  });

  it('should clear all pending requests', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    await toolkit.executeTool(
      'request_context',
      {
        query: 'Query 1',
        reason: 'Reason 1',
      },
      'agent-1'
    );
    await toolkit.executeTool(
      'request_context',
      {
        query: 'Query 2',
        reason: 'Reason 2',
      },
      'agent-1'
    );

    expect(toolkit.getPendingContextRequests()).toHaveLength(2);

    toolkit.clearPendingRequests();

    expect(toolkit.getPendingContextRequests()).toHaveLength(0);
  });

  it('should report hasPendingRequests correctly', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    expect(toolkit.hasPendingRequests()).toBe(false);

    await toolkit.executeTool(
      'request_context',
      {
        query: 'Test query',
        reason: 'Test reason',
      },
      'agent-1'
    );

    expect(toolkit.hasPendingRequests()).toBe(true);

    toolkit.clearPendingRequests();

    expect(toolkit.hasPendingRequests()).toBe(false);
  });

  it('should generate unique request IDs', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    await toolkit.executeTool(
      'request_context',
      {
        query: 'Query 1',
        reason: 'Reason 1',
      },
      'agent-1'
    );
    await toolkit.executeTool(
      'request_context',
      {
        query: 'Query 2',
        reason: 'Reason 2',
      },
      'agent-1'
    );

    const requests = toolkit.getPendingContextRequests();
    const ids = requests.map((r) => r.id);
    expect(new Set(ids).size).toBe(2); // All IDs should be unique
  });

  it('should track requests from different agents', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    await toolkit.executeTool(
      'request_context',
      {
        query: 'Query from agent 1',
        reason: 'Reason 1',
      },
      'agent-1'
    );

    await toolkit.executeTool(
      'request_context',
      {
        query: 'Query from agent 2',
        reason: 'Reason 2',
      },
      'agent-2'
    );

    const requests = toolkit.getPendingContextRequests();
    expect(requests).toHaveLength(2);
    expect(requests[0]?.agentId).toBe('agent-1');
    expect(requests[1]?.agentId).toBe('agent-2');
  });
});

describe('Zod Schema Validation', () => {
  let toolkit: DefaultAgentToolkit;

  beforeEach(() => {
    toolkit = new DefaultAgentToolkit();
  });

  describe('custom tools bypass validation', () => {
    it('should not validate custom tool inputs', async () => {
      toolkit.registerTool({
        tool: {
          name: 'custom_no_schema',
          description: 'A custom tool without schema',
          parameters: {},
        },
        executor: async (input) => ({
          success: true,
          data: { received: input },
        }),
      });

      // Custom tools should pass any input through without validation
      const result = (await toolkit.executeTool('custom_no_schema', {
        anyField: 'any value',
        nested: { data: true },
      })) as {
        success: boolean;
        data?: { received: unknown };
      };

      expect(result.success).toBe(true);
      expect(result.data?.received).toEqual({
        anyField: 'any value',
        nested: { data: true },
      });
    });
  });
});
