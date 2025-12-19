import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PerplexityAgent,
  createPerplexityAgent,
  type PerplexitySearchOptions,
} from '../../../src/agents/perplexity.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';

// Extended mock response metadata for Perplexity
interface MockPerplexityMetadata {
  citations?: Array<string | { url: string; title?: string }>;
  images?: Array<string | { url: string; description?: string }>;
  related_questions?: string[];
}

// Mock OpenAI-compatible client (Perplexity uses OpenAI API format)
const createMockClient = (
  responseContent: string,
  finishReason = 'stop',
  metadata?: MockPerplexityMetadata
) => {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: { content: responseContent, role: 'assistant' },
              finish_reason: finishReason,
            },
          ],
          citations: metadata?.citations,
          images: metadata?.images,
          related_questions: metadata?.related_questions,
        }),
      },
    },
  };
};

// Mock client that simulates tool use
const createMockClientWithToolUse = (
  toolCallName: string,
  toolCallArgs: string,
  finalResponse: string
) => {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              choices: [
                {
                  message: {
                    content: null,
                    role: 'assistant',
                    tool_calls: [
                      {
                        id: 'tool-1',
                        type: 'function',
                        function: {
                          name: toolCallName,
                          arguments: toolCallArgs,
                        },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            });
          }
          return Promise.resolve({
            choices: [
              {
                message: { content: finalResponse, role: 'assistant' },
                finish_reason: 'stop',
              },
            ],
          });
        }),
      },
    },
  };
};

describe('PerplexityAgent', () => {
  const defaultConfig: AgentConfig = {
    id: 'perplexity-test',
    name: 'Perplexity Test',
    provider: 'perplexity',
    model: 'llama-3.1-sonar-large-128k-online',
    temperature: 0.7,
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Should AI be regulated?',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  describe('constructor', () => {
    it('should create agent with custom client', () => {
      const mockClient = createMockClient('test');
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      expect(agent.id).toBe('perplexity-test');
      expect(agent.provider).toBe('perplexity');
    });
  });

  describe('generateResponse', () => {
    it('should generate response from Perplexity API', async () => {
      const mockResponse = JSON.stringify({
        position: 'AI should be regulated',
        reasoning: 'To ensure safety and fairness',
        confidence: 0.85,
      });

      const mockClient = createMockClient(mockResponse);
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
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
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
      const mockClient = createMockClient('This is a plain text response without JSON');
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.position).toBeDefined();
      expect(response.reasoning).toContain('plain text response');
      expect(response.confidence).toBe(0.5); // fallback
    });

    it('should clamp confidence to 0-1 range', async () => {
      const mockResponse = JSON.stringify({
        position: 'Test',
        reasoning: 'Test',
        confidence: 1.5, // Above 1
      });

      const mockClient = createMockClient(mockResponse);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.confidence).toBe(1);
    });

    it('should extract citations from Perplexity response', async () => {
      const mockResponse = '{"position":"test","reasoning":"test","confidence":0.5}';
      const metadata: MockPerplexityMetadata = {
        citations: [
          { url: 'https://example.com/1', title: 'Source 1' },
          { url: 'https://example.com/2', title: 'Source 2' },
        ],
      };

      const mockClient = createMockClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.citations).toHaveLength(2);
      expect(response.citations?.[0]?.title).toBe('Source 1');
      expect(response.citations?.[0]?.url).toBe('https://example.com/1');
    });

    it('should extract images from Perplexity response', async () => {
      const mockResponse = '{"position":"test","reasoning":"test","confidence":0.5}';
      const metadata: MockPerplexityMetadata = {
        images: [
          { url: 'https://example.com/img1.jpg', description: 'Image 1' },
          'https://example.com/img2.jpg',
        ],
      };

      const mockClient = createMockClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.images).toHaveLength(2);
      expect(response.images?.[0]?.url).toBe('https://example.com/img1.jpg');
      expect(response.images?.[0]?.description).toBe('Image 1');
      expect(response.images?.[1]?.url).toBe('https://example.com/img2.jpg');
    });

    it('should extract related questions from Perplexity response', async () => {
      const mockResponse = '{"position":"test","reasoning":"test","confidence":0.5}';
      const metadata: MockPerplexityMetadata = {
        related_questions: [
          'What are the benefits of AI?',
          'How is AI used in healthcare?',
        ],
      };

      const mockClient = createMockClient(mockResponse, 'stop', metadata);
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.relatedQuestions).toHaveLength(2);
      expect(response.relatedQuestions?.[0]).toBe('What are the benefits of AI?');
      expect(response.relatedQuestions?.[1]).toBe('How is AI used in healthcare?');
    });

    it('should include previous responses in user message', async () => {
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });

      const contextWithPrevious: DebateContext = {
        ...defaultContext,
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
      };

      await agent.generateResponse(contextWithPrevious);

      const call = mockClient.chat.completions.create.mock.calls[0]?.[0];
      const userMessage = call?.messages?.find((m: { role: string }) => m.role === 'user');
      expect(userMessage?.content).toContain('Other Agent');
      expect(userMessage?.content).toContain('AI should not be regulated');
    });
  });

  describe('tool use', () => {
    it('should handle tool use response', async () => {
      const mockClient = createMockClientWithToolUse(
        'search_web',
        JSON.stringify({ query: 'AI regulation' }),
        '{"position":"Based on research","reasoning":"Found relevant sources","confidence":0.9}'
      );

      const mockToolkit: AgentToolkit = {
        getTools: () => [
          {
            name: 'search_web',
            description: 'Search the web',
            parameters: { query: { type: 'string' } },
          },
        ],
        executeTool: vi.fn().mockResolvedValue({
          results: [
            { title: 'AI News', url: 'https://example.com', snippet: 'Recent developments...' },
          ],
        }),
      };

      const agent = new PerplexityAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      expect(mockToolkit.executeTool).toHaveBeenCalledWith('search_web', { query: 'AI regulation' });
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('search_web');
      expect(response.citations).toHaveLength(1);
      expect(response.citations?.[0]?.title).toBe('AI News');
    });

    it('should provide tools to API when toolkit is set', async () => {
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
      const mockToolkit: AgentToolkit = {
        getTools: () => [
          {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { input: { type: 'string' } },
          },
        ],
        executeTool: vi.fn(),
      };

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
      const mockClient = createMockClientWithToolUse(
        'failing_tool',
        JSON.stringify({ input: 'test' }),
        '{"position":"Handled error","reasoning":"Continued despite tool failure","confidence":0.6}'
      );

      const mockToolkit: AgentToolkit = {
        getTools: () => [
          {
            name: 'failing_tool',
            description: 'A failing tool',
            parameters: { input: { type: 'string' } },
          },
        ],
        executeTool: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };

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
  const defaultConfig: AgentConfig = {
    id: 'perplexity-test',
    name: 'Perplexity Test',
    provider: 'perplexity',
    model: 'llama-3.1-sonar-large-128k-online',
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Should AI be regulated?',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  it('should initialize with search options from constructor', () => {
    const mockClient = createMockClient('test');
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
    const mockClient = createMockClient('test');
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
    const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
    const searchOptions: PerplexitySearchOptions = {
      recencyFilter: 'month',
      domainFilter: ['arxiv.org', 'nature.com'],
      returnImages: true,
      returnRelatedQuestions: true,
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
        return_images: true,
        return_related_questions: true,
      })
    );
  });

  it('should limit domain filter to 3 domains', async () => {
    const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
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
    const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
    const agent = new PerplexityAgent(defaultConfig, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    await agent.generateResponse(defaultContext);

    const callArgs = mockClient.chat.completions.create.mock.calls[0]?.[0];
    expect(callArgs).not.toHaveProperty('search_recency_filter');
    expect(callArgs).not.toHaveProperty('search_domain_filter');
    expect(callArgs).not.toHaveProperty('return_images');
    expect(callArgs).not.toHaveProperty('return_related_questions');
  });
});

describe('createPerplexityAgent', () => {
  it('should create agent with factory function', () => {
    const mockClient = createMockClient('test');
    const config: AgentConfig = {
      id: 'factory-agent',
      name: 'Factory Agent',
      provider: 'perplexity',
      model: 'llama-3.1-sonar-small-128k-online',
    };

    const agent = createPerplexityAgent(config, undefined, {
      client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
    });

    expect(agent.id).toBe('factory-agent');
    expect(agent).toBeInstanceOf(PerplexityAgent);
  });

  it('should set toolkit when provided', () => {
    const mockClient = createMockClient('test');
    const mockToolkit: AgentToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
    };

    const agent = createPerplexityAgent(
      {
        id: 'test',
        name: 'Test',
        provider: 'perplexity',
        model: 'sonar',
      },
      mockToolkit,
      {
        client: mockClient as unknown as ConstructorParameters<typeof PerplexityAgent>[1]['client'],
      }
    );

    expect(agent).toBeInstanceOf(PerplexityAgent);
  });
});
