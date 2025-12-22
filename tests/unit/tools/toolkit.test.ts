import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DefaultAgentToolkit,
  createDefaultToolkit,
  type WebSearchProvider,
  type SessionDataProvider,
  type PerplexitySearchProvider,
  type PerplexitySearchResult,
} from '../../../src/tools/toolkit.js';
import type { DebateContext, SearchResult } from '../../../src/types/index.js';

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

      expect(tools).toHaveLength(6);
      expect(tools.map((t) => t.name)).toContain('get_context');
      expect(tools.map((t) => t.name)).toContain('submit_response');
      expect(tools.map((t) => t.name)).toContain('search_web');
      expect(tools.map((t) => t.name)).toContain('fact_check');
      expect(tools.map((t) => t.name)).toContain('perplexity_search');
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

  describe('get_context tool', () => {
    it('should return error when no context is set', async () => {
      const result = await toolkit.executeTool('get_context', {});

      expect(result).toEqual({
        success: false,
        error: 'No debate context available',
      });
    });

    it('should return context when set', async () => {
      toolkit.setContext(defaultContext);

      const result = (await toolkit.executeTool('get_context', {})) as {
        success: boolean;
        data?: {
          topic: string;
          mode: string;
          currentRound: number;
          totalRounds: number;
          previousResponses: Array<{
            agentName: string;
            position: string;
            confidence: number;
          }>;
          focusQuestion?: string;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data?.topic).toBe('Should AI be regulated?');
      expect(result.data?.mode).toBe('collaborative');
      expect(result.data?.currentRound).toBe(2);
      expect(result.data?.totalRounds).toBe(3);
      expect(result.data?.focusQuestion).toBe('What about innovation?');
      expect(result.data?.previousResponses).toHaveLength(1);
      expect(result.data?.previousResponses[0]?.agentName).toBe('Agent One');
    });
  });

  describe('submit_response tool', () => {
    it('should validate and return response', async () => {
      const input = {
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.85,
      };

      const result = (await toolkit.executeTool('submit_response', input)) as {
        success: boolean;
        data?: {
          position: string;
          reasoning: string;
          confidence: number;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data?.position).toBe('Test position');
      expect(result.data?.reasoning).toBe('Test reasoning');
      expect(result.data?.confidence).toBe(0.85);
    });

    it('should reject missing position', async () => {
      const input = {
        reasoning: 'Test reasoning',
        confidence: 0.5,
      };

      const result = (await toolkit.executeTool('submit_response', input)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('position');
    });

    it('should reject missing reasoning', async () => {
      const input = {
        position: 'Test position',
        confidence: 0.5,
      };

      const result = (await toolkit.executeTool('submit_response', input)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('reasoning');
    });

    it('should reject confidence out of valid range', async () => {
      const input = {
        position: 'Test',
        reasoning: 'Test',
        confidence: 1.5,
      };

      const result = (await toolkit.executeTool('submit_response', input)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('confidence');
    });

    it('should use default confidence when not provided', async () => {
      const input = {
        position: 'Test',
        reasoning: 'Test',
      };

      const result = (await toolkit.executeTool('submit_response', input)) as {
        success: boolean;
        data?: { confidence: number };
      };

      expect(result.success).toBe(true);
      expect(result.data?.confidence).toBe(0.5);
    });
  });

  describe('search_web tool', () => {
    it('should return error when no search provider', async () => {
      const result = await toolkit.executeTool('search_web', {
        query: 'test',
      });

      expect(result).toEqual({
        success: false,
        error: 'Web search is not available',
      });
    });

    it('should return error for missing query', async () => {
      const mockProvider: WebSearchProvider = {
        search: vi.fn(),
      };
      const toolkitWithSearch = new DefaultAgentToolkit(mockProvider);

      const result = (await toolkitWithSearch.executeTool('search_web', {})) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should search and return results', async () => {
      const mockResults: SearchResult[] = [
        {
          title: 'Test Article',
          url: 'https://example.com',
          snippet: 'Test snippet',
        },
      ];

      const mockProvider: WebSearchProvider = {
        search: vi.fn().mockResolvedValue(mockResults),
      };
      const toolkitWithSearch = new DefaultAgentToolkit(mockProvider);

      const result = (await toolkitWithSearch.executeTool('search_web', {
        query: 'AI regulation',
        max_results: 5,
      })) as {
        success: boolean;
        data?: { results: SearchResult[] };
      };

      expect(result.success).toBe(true);
      expect(result.data?.results).toHaveLength(1);
      expect(mockProvider.search).toHaveBeenCalledWith('AI regulation', {
        maxResults: 5,
      });
    });

    it('should reject max_results over 10', async () => {
      const mockProvider: WebSearchProvider = {
        search: vi.fn().mockResolvedValue([]),
      };
      const toolkitWithSearch = new DefaultAgentToolkit(mockProvider);

      const result = (await toolkitWithSearch.executeTool('search_web', {
        query: 'test',
        max_results: 100,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('max_results');
      expect(mockProvider.search).not.toHaveBeenCalled();
    });

    it('should handle search errors', async () => {
      const mockProvider: WebSearchProvider = {
        search: vi.fn().mockRejectedValue(new Error('Search failed')),
      };
      const toolkitWithSearch = new DefaultAgentToolkit(mockProvider);

      const result = await toolkitWithSearch.executeTool('search_web', {
        query: 'test',
      });

      expect(result).toEqual({
        success: false,
        error: 'Search failed',
      });
    });
  });

  describe('fact_check tool', () => {
    it('should return error for missing claim', async () => {
      const result = (await toolkit.executeTool('fact_check', {})) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('claim');
    });

    it('should return basic result without providers', async () => {
      const result = (await toolkit.executeTool('fact_check', {
        claim: 'AI will replace all jobs',
        source_agent: 'Agent One',
      })) as {
        success: boolean;
        data?: {
          claim: string;
          sourceAgent: string;
          webEvidence: SearchResult[];
          debateEvidence: unknown[];
        };
      };

      expect(result.success).toBe(true);
      expect(result.data?.claim).toBe('AI will replace all jobs');
      expect(result.data?.sourceAgent).toBe('Agent One');
      expect(result.data?.webEvidence).toEqual([]);
      expect(result.data?.debateEvidence).toEqual([]);
    });

    it('should include web evidence when provider available', async () => {
      const mockResults: SearchResult[] = [
        {
          title: 'Fact Check: AI Jobs',
          url: 'https://factcheck.com',
          snippet: 'Actually...',
        },
      ];

      const mockProvider: WebSearchProvider = {
        search: vi.fn().mockResolvedValue(mockResults),
      };
      const toolkitWithSearch = new DefaultAgentToolkit(mockProvider);

      const result = (await toolkitWithSearch.executeTool('fact_check', {
        claim: 'AI will replace jobs',
      })) as {
        success: boolean;
        data?: { webEvidence: SearchResult[] };
      };

      expect(result.success).toBe(true);
      expect(result.data?.webEvidence).toHaveLength(1);
      expect(mockProvider.search).toHaveBeenCalledWith(
        'fact check: AI will replace jobs',
        { maxResults: 3 }
      );
    });

    it('should include debate evidence when provider available', async () => {
      const mockEvidence = [
        {
          agentName: 'Agent Two',
          evidence: 'Related argument',
          confidence: 0.7,
        },
      ];

      const mockSessionProvider: SessionDataProvider = {
        getSession: vi.fn(),
        findRelatedEvidence: vi.fn().mockResolvedValue(mockEvidence),
      };
      const toolkitWithSession = new DefaultAgentToolkit(
        undefined,
        mockSessionProvider
      );

      const result = (await toolkitWithSession.executeTool('fact_check', {
        claim: 'Test claim',
      })) as {
        success: boolean;
        data?: {
          debateEvidence: Array<{
            agentName: string;
            evidence: string;
            confidence: number;
          }>;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data?.debateEvidence).toHaveLength(1);
      expect(result.data?.debateEvidence[0]?.agentName).toBe('Agent Two');
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

describe('perplexity_search tool', () => {
  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'AI regulation',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  it('should return error when provider is not available', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('perplexity_search', {
      query: 'test query',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('should return error when query is missing', async () => {
    const mockProvider: PerplexitySearchProvider = {
      search: vi.fn(),
    };
    const toolkit = new DefaultAgentToolkit(undefined, undefined, mockProvider);
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('perplexity_search', {})) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain('query');
  });

  it('should return error for invalid recency_filter', async () => {
    const mockProvider: PerplexitySearchProvider = {
      search: vi.fn(),
    };
    const toolkit = new DefaultAgentToolkit(undefined, undefined, mockProvider);
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('perplexity_search', {
      query: 'test',
      recency_filter: 'invalid',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('recency_filter');
  });

  it('should execute search with all options', async () => {
    const mockResult: PerplexitySearchResult = {
      answer: 'AI regulation is important because...',
      citations: [{ title: 'Source 1', url: 'https://example.com' }],
      images: [{ url: 'https://example.com/img.jpg' }],
      related_questions: ['What are the benefits?'],
    };

    const mockProvider: PerplexitySearchProvider = {
      search: vi.fn().mockResolvedValue(mockResult),
    };
    const toolkit = new DefaultAgentToolkit(undefined, undefined, mockProvider);
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('perplexity_search', {
      query: 'AI regulation 2024',
      recency_filter: 'week',
      domain_filter: ['reuters.com', 'bbc.com'],
      return_images: true,
      return_related_questions: true,
    })) as { success: boolean; data?: PerplexitySearchResult };

    expect(result.success).toBe(true);
    expect(result.data?.answer).toBe('AI regulation is important because...');
    expect(result.data?.citations).toHaveLength(1);
    expect(result.data?.images).toHaveLength(1);
    expect(result.data?.related_questions).toHaveLength(1);

    expect(mockProvider.search).toHaveBeenCalledWith({
      query: 'AI regulation 2024',
      recency_filter: 'week',
      domain_filter: ['reuters.com', 'bbc.com'],
      return_images: true,
      return_related_questions: true,
    });
  });

  it('should reject domain_filter with more than 3 domains', async () => {
    const mockProvider: PerplexitySearchProvider = {
      search: vi.fn().mockResolvedValue({ answer: 'test' }),
    };
    const toolkit = new DefaultAgentToolkit(undefined, undefined, mockProvider);
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('perplexity_search', {
      query: 'test',
      domain_filter: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'],
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('domain_filter');
    expect(mockProvider.search).not.toHaveBeenCalled();
  });

  it('should handle provider errors gracefully', async () => {
    const mockProvider: PerplexitySearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('API error')),
    };
    const toolkit = new DefaultAgentToolkit(undefined, undefined, mockProvider);
    toolkit.setContext(defaultContext);

    const result = (await toolkit.executeTool('perplexity_search', {
      query: 'test',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe('API error');
  });
});

describe('createDefaultToolkit', () => {
  it('should create toolkit without providers', () => {
    const toolkit = createDefaultToolkit();
    expect(toolkit.getTools()).toHaveLength(6);
  });

  it('should create toolkit with providers', () => {
    const mockSearchProvider: WebSearchProvider = {
      search: vi.fn(),
    };
    const mockSessionProvider: SessionDataProvider = {
      getSession: vi.fn(),
      findRelatedEvidence: vi.fn(),
    };

    const toolkit = createDefaultToolkit(mockSearchProvider, mockSessionProvider);
    expect(toolkit.getTools()).toHaveLength(6);
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

  it('should create a context request with required priority', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);
    toolkit.setCurrentAgentId('agent-1');

    const result = (await toolkit.executeTool('request_context', {
      query: 'What are the latest EU AI regulations?',
      reason: 'Need current regulatory context for accurate discussion',
      priority: 'required',
    })) as { success: boolean; data?: { requestId: string; message: string } };

    expect(result.success).toBe(true);
    expect(result.data?.requestId).toBeDefined();
    expect(result.data?.requestId).toMatch(/^ctx-\d+-\d+$/);
    expect(result.data?.message).toContain('queued');
  });

  it('should create a context request with optional priority', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);
    toolkit.setCurrentAgentId('agent-1');

    const result = (await toolkit.executeTool('request_context', {
      query: 'Historical examples of AI regulation',
      reason: 'Would help but not essential',
      priority: 'optional',
    })) as { success: boolean; data?: { requestId: string; message: string } };

    expect(result.success).toBe(true);
    expect(result.data?.requestId).toBeDefined();
  });

  it('should default to required priority when not specified', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);
    toolkit.setCurrentAgentId('agent-1');

    await toolkit.executeTool('request_context', {
      query: 'Test query',
      reason: 'Test reason',
    });

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
    toolkit.setCurrentAgentId('test-agent-123');

    await toolkit.executeTool('request_context', {
      query: 'Test query',
      reason: 'Test reason',
    });

    const requests = toolkit.getPendingContextRequests();
    expect(requests[0]?.agentId).toBe('test-agent-123');
  });

  it('should include timestamp in context request', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);
    toolkit.setCurrentAgentId('agent-1');

    const before = new Date();
    await toolkit.executeTool('request_context', {
      query: 'Test query',
      reason: 'Test reason',
    });
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
    toolkit.setCurrentAgentId('agent-1');

    await toolkit.executeTool('request_context', {
      query: 'First query',
      reason: 'First reason',
    });
    await toolkit.executeTool('request_context', {
      query: 'Second query',
      reason: 'Second reason',
    });

    const requests = toolkit.getPendingContextRequests();
    expect(requests).toHaveLength(2);
    expect(requests[0]?.query).toBe('First query');
    expect(requests[1]?.query).toBe('Second query');
  });

  it('should clear all pending requests', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);
    toolkit.setCurrentAgentId('agent-1');

    await toolkit.executeTool('request_context', {
      query: 'Query 1',
      reason: 'Reason 1',
    });
    await toolkit.executeTool('request_context', {
      query: 'Query 2',
      reason: 'Reason 2',
    });

    expect(toolkit.getPendingContextRequests()).toHaveLength(2);

    toolkit.clearPendingRequests();

    expect(toolkit.getPendingContextRequests()).toHaveLength(0);
  });

  it('should report hasPendingRequests correctly', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);
    toolkit.setCurrentAgentId('agent-1');

    expect(toolkit.hasPendingRequests()).toBe(false);

    await toolkit.executeTool('request_context', {
      query: 'Test query',
      reason: 'Test reason',
    });

    expect(toolkit.hasPendingRequests()).toBe(true);

    toolkit.clearPendingRequests();

    expect(toolkit.hasPendingRequests()).toBe(false);
  });

  it('should generate unique request IDs', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);
    toolkit.setCurrentAgentId('agent-1');

    await toolkit.executeTool('request_context', {
      query: 'Query 1',
      reason: 'Reason 1',
    });
    await toolkit.executeTool('request_context', {
      query: 'Query 2',
      reason: 'Reason 2',
    });

    const requests = toolkit.getPendingContextRequests();
    const ids = requests.map((r) => r.id);
    expect(new Set(ids).size).toBe(2); // All IDs should be unique
  });

  it('should track requests from different agents', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    toolkit.setCurrentAgentId('agent-1');
    await toolkit.executeTool('request_context', {
      query: 'Query from agent 1',
      reason: 'Reason 1',
    });

    toolkit.setCurrentAgentId('agent-2');
    await toolkit.executeTool('request_context', {
      query: 'Query from agent 2',
      reason: 'Reason 2',
    });

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

  describe('submit_response validation', () => {
    it('should reject empty position string', async () => {
      const result = (await toolkit.executeTool('submit_response', {
        position: '',
        reasoning: 'Valid reasoning',
        confidence: 0.5,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('position');
    });

    it('should reject empty reasoning string', async () => {
      const result = (await toolkit.executeTool('submit_response', {
        position: 'Valid position',
        reasoning: '',
        confidence: 0.5,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('reasoning');
    });

    it('should reject negative confidence', async () => {
      const result = (await toolkit.executeTool('submit_response', {
        position: 'Valid position',
        reasoning: 'Valid reasoning',
        confidence: -0.5,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('confidence');
    });

    it('should reject non-numeric confidence', async () => {
      const result = (await toolkit.executeTool('submit_response', {
        position: 'Valid position',
        reasoning: 'Valid reasoning',
        confidence: 'high',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('confidence');
    });
  });

  describe('search_web validation', () => {
    it('should reject empty query string', async () => {
      const mockProvider: WebSearchProvider = { search: vi.fn() };
      const toolkitWithSearch = new DefaultAgentToolkit(mockProvider);

      const result = (await toolkitWithSearch.executeTool('search_web', {
        query: '',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should reject non-integer max_results', async () => {
      const mockProvider: WebSearchProvider = { search: vi.fn() };
      const toolkitWithSearch = new DefaultAgentToolkit(mockProvider);

      const result = (await toolkitWithSearch.executeTool('search_web', {
        query: 'test',
        max_results: 5.5,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('max_results');
    });

    it('should reject zero max_results', async () => {
      const mockProvider: WebSearchProvider = { search: vi.fn() };
      const toolkitWithSearch = new DefaultAgentToolkit(mockProvider);

      const result = (await toolkitWithSearch.executeTool('search_web', {
        query: 'test',
        max_results: 0,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('max_results');
    });
  });

  describe('fact_check validation', () => {
    it('should reject empty claim string', async () => {
      const result = (await toolkit.executeTool('fact_check', {
        claim: '',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('claim');
    });

    it('should use default source_agent when not provided', async () => {
      const result = (await toolkit.executeTool('fact_check', {
        claim: 'Test claim',
      })) as {
        success: boolean;
        data?: { sourceAgent: string };
      };

      expect(result.success).toBe(true);
      expect(result.data?.sourceAgent).toBe('unknown');
    });
  });

  describe('perplexity_search validation', () => {
    it('should reject empty query string', async () => {
      const mockProvider: PerplexitySearchProvider = { search: vi.fn() };
      const toolkitWithPerplexity = new DefaultAgentToolkit(undefined, undefined, mockProvider);

      const result = (await toolkitWithPerplexity.executeTool('perplexity_search', {
        query: '',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should accept valid recency_filter values', async () => {
      const mockProvider: PerplexitySearchProvider = {
        search: vi.fn().mockResolvedValue({ answer: 'test' }),
      };
      const toolkitWithPerplexity = new DefaultAgentToolkit(undefined, undefined, mockProvider);

      for (const filter of ['hour', 'day', 'week', 'month']) {
        const result = await toolkitWithPerplexity.executeTool('perplexity_search', {
          query: 'test',
          recency_filter: filter,
        });

        expect((result as { success: boolean }).success).toBe(true);
      }
    });

    it('should reject empty domain strings in domain_filter', async () => {
      const mockProvider: PerplexitySearchProvider = { search: vi.fn() };
      const toolkitWithPerplexity = new DefaultAgentToolkit(undefined, undefined, mockProvider);

      const result = (await toolkitWithPerplexity.executeTool('perplexity_search', {
        query: 'test',
        domain_filter: ['valid.com', ''],
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('domain_filter');
    });

    it('should accept exactly 3 domains', async () => {
      const mockProvider: PerplexitySearchProvider = {
        search: vi.fn().mockResolvedValue({ answer: 'test' }),
      };
      const toolkitWithPerplexity = new DefaultAgentToolkit(undefined, undefined, mockProvider);

      const result = await toolkitWithPerplexity.executeTool('perplexity_search', {
        query: 'test',
        domain_filter: ['a.com', 'b.com', 'c.com'],
      });

      expect((result as { success: boolean }).success).toBe(true);
    });
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
