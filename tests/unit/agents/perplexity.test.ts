import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PerplexityAgent,
  createPerplexityAgent,
  type PerplexitySearchOptions,
} from '../../../src/agents/perplexity/index.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import {
  createMockPerplexityClient,
  createMockPerplexityClientWithToolUse,
  createMockContext,
  createMockAgentConfig,
  createMockToolkit,
  createJsonResponse,
  type MockPerplexityMetadata,
} from '../../utils/index.js';

describe('PerplexityAgent', () => {
  const defaultConfig: AgentConfig = createMockAgentConfig({
    id: 'perplexity-test',
    name: 'Perplexity Test',
    provider: 'perplexity',
    model: 'llama-3.1-sonar-large-128k-online',
  });

  const defaultContext: DebateContext = createMockContext({
    topic: 'Should AI be regulated?',
  });

  describe('constructor', () => {
    it('should create agent with custom client', () => {
      const mockClient = createMockPerplexityClient('test');
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      expect(agent.id).toBe('perplexity-test');
      expect(agent.provider).toBe('perplexity');
    });
  });

  describe('generateResponse', () => {
    it('should generate response from Perplexity API', async () => {
      const mockResponse = createJsonResponse({
        position: 'AI should be regulated',
        reasoning: 'To ensure safety and fairness',
        confidence: 0.85,
      });

      const mockClient = createMockPerplexityClient(mockResponse);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.agentId).toBe('perplexity-test');
      expect(response.agentName).toBe('Perplexity Test');
      expect(response.position).toBe('AI should be regulated');
      expect(response.reasoning).toBe('To ensure safety and fairness');
      expect(response.confidence).toBe(0.85);
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should call API with correct parameters', async () => {
      const mockClient = createMockPerplexityClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'llama-3.1-sonar-large-128k-online',
          max_tokens: 4096,
          temperature: 0.7,
        })
      );
    });

    it('should handle non-JSON response gracefully', async () => {
      const mockClient = createMockPerplexityClient('This is a plain text response without JSON');
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.position).toBeDefined();
      expect(response.reasoning).toContain('plain text response');
      expect(response.confidence).toBe(0.5); // fallback
    });

    it('should clamp confidence to 0-1 range', async () => {
      const mockResponse = createJsonResponse({
        position: 'Test',
        reasoning: 'Test',
        confidence: 1.5,
      });

      const mockClient = createMockPerplexityClient(mockResponse);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.confidence).toBe(1);
    });

    it('should extract citations from Perplexity response (deprecated citations field)', async () => {
      const mockResponse = '{"position":"test [1] [2]","reasoning":"test","confidence":0.5}';
      // Deprecated citations field is an array of string URLs (not objects)
      const metadata: MockPerplexityMetadata = {
        citations: ['https://example.com/article1', 'https://example.com/article2'],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.citations).toHaveLength(2);
      // Title is extracted from domain for deprecated string citations
      expect(response.citations?.[0]?.title).toBe('example.com');
      expect(response.citations?.[0]?.url).toBe('https://example.com/article1');
      // Should record perplexity_search tool call when citations are returned
      expect(response.toolCalls?.some((tc) => tc.toolName === 'perplexity_search')).toBe(true);
    });

    it('should extract domain from URL when citation is a string (deprecated format)', async () => {
      const mockResponse = '{"position":"test [1]","reasoning":"test","confidence":0.5}';
      const metadata: MockPerplexityMetadata = {
        citations: ['https://www.jsonapi.org/format/', 'https://example.com/article'],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should extract domain as title, not use URL directly
      expect(response.citations?.[0]?.title).toBe('jsonapi.org');
      expect(response.citations?.[0]?.url).toBe('https://www.jsonapi.org/format/');
    });

    it('should filter citations to only those referenced in response text', async () => {
      // Response only references [1] and [3], not [2]
      const mockResponse =
        '{"position":"According to [1], this is true. Also see [3].","reasoning":"test","confidence":0.5}';
      // Use search_results (new SDK field) for objects with url/title
      const metadata: MockPerplexityMetadata = {
        search_results: [
          { url: 'https://example.com/1', title: 'Source 1' },
          { url: 'https://example.com/2', title: 'Source 2' },
          { url: 'https://example.com/3', title: 'Source 3' },
        ],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should only include citations [1] and [3]
      expect(response.citations).toHaveLength(2);
      expect(response.citations?.[0]?.title).toBe('Source 1');
      expect(response.citations?.[1]?.title).toBe('Source 3');
    });

    it('should include all citations when no reference markers found', async () => {
      // Response has no citation markers like [1], [2]
      const mockResponse =
        '{"position":"AI should be regulated","reasoning":"For safety reasons","confidence":0.5}';
      // Use search_results (new SDK field) for objects with url/title
      const metadata: MockPerplexityMetadata = {
        search_results: [
          { url: 'https://example.com/1', title: 'Source 1' },
          { url: 'https://example.com/2', title: 'Source 2' },
        ],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should include all citations for backward compatibility
      expect(response.citations).toHaveLength(2);
    });

    it('should handle comma-separated citation markers like [1,2,3]', async () => {
      const mockResponse =
        '{"position":"Multiple sources agree [1, 2, 3]","reasoning":"test","confidence":0.5}';
      // Use search_results (new SDK field) for objects with url/title
      const metadata: MockPerplexityMetadata = {
        search_results: [
          { url: 'https://example.com/1', title: 'Source 1' },
          { url: 'https://example.com/2', title: 'Source 2' },
          { url: 'https://example.com/3', title: 'Source 3' },
          { url: 'https://example.com/4', title: 'Source 4' },
        ],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should include citations 1, 2, 3 but not 4
      expect(response.citations).toHaveLength(3);
      expect(response.citations?.map((c) => c.title)).toEqual(['Source 1', 'Source 2', 'Source 3']);
    });

    it('should extract citations from Perplexity response (new search_results field)', async () => {
      const mockResponse = '{"position":"test [1] [2] [3]","reasoning":"test","confidence":0.5}';
      const metadata: MockPerplexityMetadata = {
        search_results: [
          {
            url: 'https://example.com/ai-article',
            title: 'AI Regulation Overview',
            date: '2025-01-15',
          },
          { url: 'https://example.com/research', title: 'Research Paper', date: '2024-12-20' },
          { url: 'https://example.com/news', title: 'Latest AI News' }, // No date
        ],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.citations).toHaveLength(3);
      expect(response.citations?.[0]?.title).toBe('AI Regulation Overview');
      expect(response.citations?.[0]?.url).toBe('https://example.com/ai-article');
      expect(response.citations?.[0]?.snippet).toBe('Published: 2025-01-15');
      expect(response.citations?.[1]?.title).toBe('Research Paper');
      expect(response.citations?.[1]?.url).toBe('https://example.com/research');
      expect(response.citations?.[1]?.snippet).toBe('Published: 2024-12-20');
      expect(response.citations?.[2]?.title).toBe('Latest AI News');
      expect(response.citations?.[2]?.url).toBe('https://example.com/news');
      expect(response.citations?.[2]?.snippet).toBeUndefined();
    });

    it('should use domain as title fallback for search_results without title', async () => {
      const mockResponse = '{"position":"test [1]","reasoning":"test","confidence":0.5}';
      const metadata: MockPerplexityMetadata = {
        search_results: [
          { url: 'https://www.nature.com/articles/ai-study' }, // No title
        ],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.citations?.[0]?.title).toBe('nature.com');
      expect(response.citations?.[0]?.url).toBe('https://www.nature.com/articles/ai-study');
    });

    it('should prioritize search_results over deprecated citations field', async () => {
      const mockResponse = '{"position":"test","reasoning":"test","confidence":0.5}';
      const metadata: MockPerplexityMetadata = {
        // Both fields present - should use search_results
        search_results: [{ url: 'https://example.com/new', title: 'New Format Source' }],
        citations: [{ url: 'https://example.com/old', title: 'Old Format Source' }],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.citations).toHaveLength(1);
      expect(response.citations?.[0]?.title).toBe('New Format Source');
      expect(response.citations?.[0]?.url).toBe('https://example.com/new');
    });

    it('should record built-in web search as perplexity_search tool call', async () => {
      const mockResponse = '{"position":"test [1]","reasoning":"test","confidence":0.5}';
      const metadata: MockPerplexityMetadata = {
        search_results: [{ url: 'https://example.com/ai', title: 'AI Article' }],
      };

      const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should record the built-in search as a tool call for consistency
      const searchToolCall = response.toolCalls?.find((tc) => tc.toolName === 'perplexity_search');
      expect(searchToolCall).toBeDefined();
      expect(searchToolCall?.input).toEqual({ query: 'Should AI be regulated?' });
      expect(searchToolCall?.output).toEqual({
        success: true,
        data: {
          results: [{ title: 'AI Article', url: 'https://example.com/ai' }],
        },
      });
    });

    it('should not record perplexity_search tool call when no citations returned', async () => {
      const mockResponse = '{"position":"test","reasoning":"test","confidence":0.5}';
      // No metadata (no citations)
      const mockClient = createMockPerplexityClient(mockResponse, 'stop', {});
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should not have perplexity_search tool call
      expect(response.toolCalls?.some((tc) => tc.toolName === 'perplexity_search')).toBeFalsy();
    });

    it('should include previous responses in user message', async () => {
      const mockClient = createMockPerplexityClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const contextWithPrevious: DebateContext = createMockContext({
        topic: 'Should AI be regulated?',
        previousResponses: [
          {
            agentId: 'other-agent',
            agentName: 'Other Agent',
            position: 'AI should not be regulated',
            reasoning: 'Innovation should be free',
            confidence: 0.7,
            timestamp: new Date(),
          },
        ],
      });

      await agent.generateResponse(contextWithPrevious);

      const call = mockClient.chat.completions.create.mock.calls[0]?.[0];
      const userMessage = call?.messages?.find((m: { role: string }) => m.role === 'user');
      expect(userMessage?.content).toContain('Other Agent');
      expect(userMessage?.content).toContain('AI should not be regulated');
    });
  });

  describe('tool use', () => {
    it('should handle tool use response', async () => {
      const mockClient = createMockPerplexityClientWithToolUse(
        'search_web',
        JSON.stringify({ query: 'AI regulation' }),
        createJsonResponse({
          position: 'Based on research',
          reasoning: 'Found relevant sources',
          confidence: 0.9,
        })
      );

      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'search_web',
            description: 'Search the web',
            parameters: { query: { type: 'string', description: 'Search query' } },
          },
        ],
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          data: {
            results: [
              { title: 'AI News', url: 'https://example.com', snippet: 'Recent developments...' },
            ],
          },
        }),
      });

      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      expect(mockToolkit.executeTool).toHaveBeenCalledWith(
        'search_web',
        { query: 'AI regulation' },
        'perplexity-test'
      );
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('search_web');
      expect(response.citations).toHaveLength(1);
      expect(response.citations?.[0]?.title).toBe('AI News');
    });

    it('should provide tools to API when toolkit is set', async () => {
      const mockClient = createMockPerplexityClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { input: { type: 'string', description: 'Input' } },
          },
        ],
      });

      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      await agent.generateResponse(defaultContext);

      const call = mockClient.chat.completions.create.mock.calls[0]?.[0];
      expect(call?.tools).toBeDefined();
      expect(call?.tools).toHaveLength(1);
      expect(call?.tools?.[0]?.function?.name).toBe('test_tool');
    });

    it('should handle tool execution errors', async () => {
      const mockClient = createMockPerplexityClientWithToolUse(
        'failing_tool',
        JSON.stringify({ input: 'test' }),
        createJsonResponse({
          position: 'Handled error',
          reasoning: 'Continued despite tool failure',
          confidence: 0.6,
        })
      );

      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'failing_tool',
            description: 'A failing tool',
            parameters: { input: { type: 'string', description: 'Input' } },
          },
        ],
        executeTool: vi.fn().mockRejectedValue(new Error('Tool failed')),
      });

      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      // Should not throw
      const response = await agent.generateResponse(defaultContext);
      expect(response.toolCalls?.[0]?.output).toEqual({ error: 'Tool failed' });
    });
  });
});

describe('search options', () => {
  const defaultConfig: AgentConfig = createMockAgentConfig({
    id: 'perplexity-test',
    name: 'Perplexity Test',
    provider: 'perplexity',
    model: 'llama-3.1-sonar-large-128k-online',
  });

  const defaultContext: DebateContext = createMockContext({
    topic: 'Should AI be regulated?',
  });

  it('should initialize with search options from constructor', () => {
    const mockClient = createMockPerplexityClient('test');
    const searchOptions: PerplexitySearchOptions = {
      recencyFilter: 'day',
      domainFilter: ['example.com', 'test.com'],
      returnImages: true,
      returnRelatedQuestions: true,
    };

    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      searchOptions,
    });

    expect(agent.getSearchOptions()).toEqual(searchOptions);
  });

  it('should update search options with setSearchOptions', () => {
    const mockClient = createMockPerplexityClient('test');
    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    agent.setSearchOptions({ recencyFilter: 'week' });
    expect(agent.getSearchOptions().recencyFilter).toBe('week');

    agent.setSearchOptions({ domainFilter: ['news.com'] });
    expect(agent.getSearchOptions().recencyFilter).toBe('week');
    expect(agent.getSearchOptions().domainFilter).toEqual(['news.com']);
  });

  it('should pass search options to API call', async () => {
    const mockClient = createMockPerplexityClient(
      createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
    );
    const searchOptions: PerplexitySearchOptions = {
      recencyFilter: 'month',
      domainFilter: ['arxiv.org', 'nature.com'],
    };

    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      searchOptions,
    });

    await agent.generateResponse(defaultContext);

    expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        search_recency_filter: 'month',
        search_domain_filter: ['arxiv.org', 'nature.com'],
      })
    );
  });

  it('should limit domain filter to 3 domains', async () => {
    const mockClient = createMockPerplexityClient(
      createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
    );
    const searchOptions: PerplexitySearchOptions = {
      domainFilter: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'],
    };

    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      searchOptions,
    });

    await agent.generateResponse(defaultContext);

    expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        search_domain_filter: ['a.com', 'b.com', 'c.com'],
      })
    );
  });

  it('should not include undefined search options', async () => {
    const mockClient = createMockPerplexityClient(
      createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
    );
    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    await agent.generateResponse(defaultContext);

    const callArgs = mockClient.chat.completions.create.mock.calls[0]?.[0];
    // When no search options are set, values should be null (SDK allows null for optional params)
    expect(callArgs?.search_recency_filter).toBeNull();
    expect(callArgs?.search_domain_filter).toBeNull();
  });
});

describe('createPerplexityAgent', () => {
  it('should create agent with factory function', () => {
    const mockClient = createMockPerplexityClient('test');
    const config: AgentConfig = createMockAgentConfig({
      id: 'factory-agent',
      name: 'Factory Agent',
      provider: 'perplexity',
      model: 'llama-3.1-sonar-small-128k-online',
    });

    const agent = createPerplexityAgent(config, undefined, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    expect(agent.id).toBe('factory-agent');
    expect(agent).toBeInstanceOf(PerplexityAgent);
  });

  it('should set toolkit when provided', () => {
    const mockClient = createMockPerplexityClient('test');
    const mockToolkit: AgentToolkit = createMockToolkit();

    const agent = createPerplexityAgent(
      createMockAgentConfig({
        id: 'test',
        name: 'Test',
        provider: 'perplexity',
        model: 'sonar',
      }),
      mockToolkit,
      {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      }
    );

    expect(agent).toBeInstanceOf(PerplexityAgent);
  });
});

describe('Perplexity extended field type validation', () => {
  const defaultConfig: AgentConfig = createMockAgentConfig({
    id: 'perplexity-validation-test',
    name: 'Perplexity Validation Test',
    provider: 'perplexity',
    model: 'sonar',
  });

  const defaultContext: DebateContext = createMockContext({
    topic: 'Test topic',
  });

  it('should handle response with valid search_results format', async () => {
    const mockResponse = '{"position":"test","reasoning":"test","confidence":0.5}';
    const metadata: MockPerplexityMetadata = {
      search_results: [
        { url: 'https://example.com/1', title: 'Valid Title', date: '2025-01-15' },
        { url: 'https://example.com/2', title: 'Another Title' },
      ],
    };

    const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    const response = await agent.generateResponse(defaultContext);

    expect(response.citations).toHaveLength(2);
    expect(response.citations?.[0]?.url).toBe('https://example.com/1');
  });

  it('should handle response with invalid search_results structure gracefully', async () => {
    const mockResponse = '{"position":"test","reasoning":"test","confidence":0.5}';
    // Invalid: search_results should be an array
    const metadata = {
      search_results: 'not an array',
    };

    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: { content: mockResponse, role: 'assistant' },
                finish_reason: 'stop',
              },
            ],
            ...metadata,
          }),
        },
      },
    };

    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    const response = await agent.generateResponse(defaultContext);

    // Should return empty citations when validation fails
    expect(response.citations).toBeUndefined();
  });

  it('should handle response with invalid citations object structure gracefully', async () => {
    const mockResponse = '{"position":"test [1]","reasoning":"test","confidence":0.5}';
    // Invalid: citation objects missing required 'url' field
    const metadata = {
      citations: [
        { title: 'Missing URL' }, // Missing required 'url'
      ],
    };

    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: { content: mockResponse, role: 'assistant' },
                finish_reason: 'stop',
              },
            ],
            ...metadata,
          }),
        },
      },
    };

    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    const response = await agent.generateResponse(defaultContext);

    // Should return empty citations when validation fails
    expect(response.citations).toBeUndefined();
  });

  it('should handle response with valid search_results metadata', async () => {
    const mockResponse = '{"position":"test [1]","reasoning":"test","confidence":0.5}';
    const metadata: MockPerplexityMetadata = {
      search_results: [
        { url: 'https://example.com/article', title: 'Article Title', date: '2025-01-01' },
      ],
    };

    const mockClient = createMockPerplexityClient(mockResponse, 'stop', metadata);
    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    const response = await agent.generateResponse(defaultContext);

    expect(response.citations).toHaveLength(1);
    expect(response.citations?.[0]?.url).toBe('https://example.com/article');
  });

  it('should handle response with no Perplexity extensions', async () => {
    const mockResponse = '{"position":"test","reasoning":"test","confidence":0.5}';
    // No extended fields at all
    const mockClient = createMockPerplexityClient(mockResponse, 'stop', {});
    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    const response = await agent.generateResponse(defaultContext);

    expect(response.citations).toBeUndefined();
  });
});
