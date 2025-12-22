import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAgent, createClaudeAgent } from '../../../src/agents/anthropic/claude.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import {
  createMockAnthropicClient,
  createMockAnthropicClientWithToolUse,
  createMockContext,
  createMockAgentConfig,
  createMockToolkit,
  createJsonResponse,
} from '../../utils/index.js';

describe('ClaudeAgent', () => {
  const defaultConfig: AgentConfig = createMockAgentConfig({
    id: 'claude-test',
    name: 'Claude Test',
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
  });

  const defaultContext: DebateContext = createMockContext({
    topic: 'Should AI be regulated?',
  });

  describe('constructor', () => {
    it('should create agent with custom client', () => {
      const mockClient = createMockAnthropicClient('test');
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      expect(agent.id).toBe('claude-test');
      expect(agent.provider).toBe('anthropic');
    });
  });

  describe('generateResponse', () => {
    it('should generate response from Claude API', async () => {
      const mockResponse = createJsonResponse({
        position: 'AI should be regulated',
        reasoning: 'To ensure safety and fairness',
        confidence: 0.85,
      });

      const mockClient = createMockAnthropicClient(mockResponse);
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.agentId).toBe('claude-test');
      expect(response.agentName).toBe('Claude Test');
      expect(response.position).toBe('AI should be regulated');
      expect(response.reasoning).toBe('To ensure safety and fairness');
      expect(response.confidence).toBe(0.85);
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should call API with correct parameters', async () => {
      const mockClient = createMockAnthropicClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229',
          max_tokens: 4096,
          temperature: 0.7,
        })
      );
    });

    it('should handle non-JSON response gracefully', async () => {
      const mockClient = createMockAnthropicClient('This is a plain text response without JSON');
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
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

      const mockClient = createMockAnthropicClient(mockResponse);
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.confidence).toBe(1);
    });

    it('should include context in system prompt', async () => {
      const mockClient = createMockAnthropicClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const contextWithFocus: DebateContext = createMockContext({
        topic: 'Should AI be regulated?',
        focusQuestion: 'What about privacy concerns?',
      });

      await agent.generateResponse(contextWithFocus);

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      expect(call?.system).toContain('Should AI be regulated?');
      expect(call?.system).toContain('collaborative');
      expect(call?.system).toContain('What about privacy concerns?');
    });

    it('should include previous responses in user message', async () => {
      const mockClient = createMockAnthropicClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
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

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      const userMessage = call?.messages[0]?.content;
      expect(userMessage).toContain('Other Agent');
      expect(userMessage).toContain('AI should not be regulated');
    });
  });

  describe('tool use', () => {
    it('should handle tool use response', async () => {
      const mockClient = createMockAnthropicClientWithToolUse(
        'search_web',
        { query: 'AI regulation' },
        {
          results: [
            { title: 'AI News', url: 'https://example.com', snippet: 'Recent developments...' },
          ],
        },
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

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      expect(mockToolkit.executeTool).toHaveBeenCalledWith('search_web', {
        query: 'AI regulation',
      });
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('search_web');
      expect(response.citations).toHaveLength(1);
      expect(response.citations?.[0]?.title).toBe('AI News');
    });

    it('should provide tools to API when toolkit is set', async () => {
      const mockClient = createMockAnthropicClient(
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

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
        webSearch: { enabled: false }, // Disable web_search for this test
      });
      agent.setToolkit(mockToolkit);

      await agent.generateResponse(defaultContext);

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      expect(call?.tools).toBeDefined();
      expect(call?.tools).toHaveLength(1);
      expect(call?.tools?.[0]?.name).toBe('test_tool');
    });

    it('should handle tool execution errors', async () => {
      const mockClient = createMockAnthropicClientWithToolUse(
        'failing_tool',
        { input: 'test' },
        { error: 'Tool failed' },
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

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      // Should not throw
      const response = await agent.generateResponse(defaultContext);
      expect(response.toolCalls?.[0]?.output).toEqual({ error: 'Tool failed' });
    });

    it('should extract citations from perplexity_search tool', async () => {
      const mockClient = createMockAnthropicClientWithToolUse(
        'perplexity_search',
        { query: 'AI regulation', recency_filter: 'week' },
        {
          answer: 'Recent AI regulations...',
          citations: [
            { title: 'EU AI Act', url: 'https://eu.example.com', snippet: 'New regulations...' },
            { title: 'US AI Policy', url: 'https://us.example.com', snippet: 'Policy updates...' },
          ],
        },
        createJsonResponse({
          position: 'Based on recent research',
          reasoning: 'Found regulatory updates',
          confidence: 0.88,
        })
      );

      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'perplexity_search',
            description: 'Search with Perplexity',
            parameters: { query: { type: 'string', description: 'Search query' } },
          },
        ],
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          data: {
            answer: 'Recent AI regulations...',
            citations: [
              { title: 'EU AI Act', url: 'https://eu.example.com', snippet: 'New regulations...' },
              {
                title: 'US AI Policy',
                url: 'https://us.example.com',
                snippet: 'Policy updates...',
              },
            ],
          },
        }),
      });

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      expect(mockToolkit.executeTool).toHaveBeenCalledWith('perplexity_search', {
        query: 'AI regulation',
        recency_filter: 'week',
      });
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('perplexity_search');
      expect(response.citations).toHaveLength(2);
      expect(response.citations?.[0]?.title).toBe('EU AI Act');
      expect(response.citations?.[1]?.title).toBe('US AI Policy');
    });

    it('should extract position/reasoning from submit_response tool call', async () => {
      // Simulate Claude calling submit_response tool with actual position/reasoning
      // Then returning meta-commentary in text response
      const mockClient = createMockAnthropicClientWithToolUse(
        'submit_response',
        {
          position: 'AI should be carefully regulated to balance innovation and safety',
          reasoning:
            'Regulation is necessary to prevent misuse while ensuring technological progress continues. Evidence shows that proactive regulation helps establish trust.',
          confidence: 0.85,
        },
        {
          success: true,
          data: {
            position: 'AI should be carefully regulated to balance innovation and safety',
            reasoning:
              'Regulation is necessary to prevent misuse while ensuring technological progress continues. Evidence shows that proactive regulation helps establish trust.',
            confidence: 0.85,
          },
        },
        '제 입장을 제출했습니다. 요약하면 AI 규제는 신중하게 접근해야 한다는 것입니다.'
      );

      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'submit_response',
            description: 'Submit your response',
            parameters: {
              position: { type: 'string', description: 'Your position' },
              reasoning: { type: 'string', description: 'Your reasoning' },
              confidence: { type: 'number', description: 'Confidence level' },
            },
          },
        ],
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          data: {
            position: 'AI should be carefully regulated to balance innovation and safety',
            reasoning:
              'Regulation is necessary to prevent misuse while ensuring technological progress continues. Evidence shows that proactive regulation helps establish trust.',
            confidence: 0.85,
          },
        }),
      });

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      // Should extract from tool call, NOT from text response
      expect(response.position).toBe(
        'AI should be carefully regulated to balance innovation and safety'
      );
      expect(response.reasoning).toBe(
        'Regulation is necessary to prevent misuse while ensuring technological progress continues. Evidence shows that proactive regulation helps establish trust.'
      );
      expect(response.confidence).toBe(0.85);

      // Should record the tool call
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('submit_response');
    });
  });

  describe('native web search', () => {
    it('should include web_search tool by default', async () => {
      const mockClient = createMockAnthropicClient(
        createJsonResponse({
          position: 'Test',
          reasoning: 'Test',
          confidence: 0.5,
        })
      );

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      expect(call?.tools).toBeDefined();
      // Should have web_search tool
      const webSearchTool = call?.tools?.find((t: { name: string }) => t.name === 'web_search');
      expect(webSearchTool).toBeDefined();
      expect(webSearchTool?.type).toBe('web_search_20250305');
    });

    it('should not include web_search when disabled', async () => {
      const mockClient = createMockAnthropicClient(
        createJsonResponse({
          position: 'Test',
          reasoning: 'Test',
          confidence: 0.5,
        })
      );

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
        webSearch: { enabled: false },
      });

      await agent.generateResponse(defaultContext);

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      // Should have no tools (no toolkit set, web_search disabled)
      expect(call?.tools).toBeUndefined();
    });

    it('should configure web_search with allowed/blocked domains', async () => {
      const mockClient = createMockAnthropicClient(
        createJsonResponse({
          position: 'Test',
          reasoning: 'Test',
          confidence: 0.5,
        })
      );

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
        webSearch: {
          enabled: true,
          allowedDomains: ['example.com', 'test.org'],
          maxUses: 3,
        },
      });

      await agent.generateResponse(defaultContext);

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      const webSearchTool = call?.tools?.find((t: { name: string }) => t.name === 'web_search') as
        | { allowed_domains?: string[]; max_uses?: number }
        | undefined;
      expect(webSearchTool?.allowed_domains).toEqual(['example.com', 'test.org']);
      expect(webSearchTool?.max_uses).toBe(3);
    });

    it('should extract citations from web search results', async () => {
      // Create a mock that returns web search results in the response
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: 'web_search_tool_result',
                tool_use_id: 'ws-123',
                content: [
                  {
                    type: 'web_search_result',
                    title: 'AI Safety Research',
                    url: 'https://example.com/ai-safety',
                    encrypted_content: 'encrypted...',
                    page_age: '2024-01-01',
                  },
                  {
                    type: 'web_search_result',
                    title: 'Regulation Guidelines',
                    url: 'https://gov.example.com/guidelines',
                    encrypted_content: 'encrypted...',
                    page_age: '2024-06-15',
                  },
                ],
              },
              {
                type: 'text',
                text: JSON.stringify({
                  position: 'Based on research',
                  reasoning: 'Found relevant sources',
                  confidence: 0.9,
                }),
              },
            ],
            stop_reason: 'end_turn',
          }),
        },
      };

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.citations).toHaveLength(2);
      expect(response.citations?.[0]?.title).toBe('AI Safety Research');
      expect(response.citations?.[0]?.url).toBe('https://example.com/ai-safety');
      expect(response.citations?.[0]?.source).toBe('web_search');
      expect(response.citations?.[1]?.title).toBe('Regulation Guidelines');
    });

    it('should record web search tool calls', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: 'web_search_tool_result',
                tool_use_id: 'ws-123',
                content: [
                  {
                    type: 'web_search_result',
                    title: 'Test Result',
                    url: 'https://example.com/test',
                    encrypted_content: 'encrypted...',
                    page_age: '2024-01-01',
                  },
                ],
              },
              {
                type: 'text',
                text: JSON.stringify({
                  position: 'Test',
                  reasoning: 'Test',
                  confidence: 0.5,
                }),
              },
            ],
            stop_reason: 'end_turn',
          }),
        },
      };

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('web_search');
      expect(response.toolCalls?.[0]?.output).toMatchObject({
        success: true,
        data: {
          results: [{ title: 'Test Result', url: 'https://example.com/test' }],
        },
      });
    });

    it('should handle web search errors gracefully', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: 'web_search_tool_result',
                tool_use_id: 'ws-error',
                content: {
                  type: 'web_search_tool_result_error',
                  error_code: 'unavailable',
                },
              },
              {
                type: 'text',
                text: JSON.stringify({
                  position: 'Continued without search',
                  reasoning: 'Search unavailable',
                  confidence: 0.4,
                }),
              },
            ],
            stop_reason: 'end_turn',
          }),
        },
      };

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should not extract citations from error (empty array or undefined)
      expect(response.citations?.length ?? 0).toBe(0);
      // Should still generate a response
      expect(response.position).toBe('Continued without search');
    });
  });
});

describe('createClaudeAgent', () => {
  it('should create agent with factory function', () => {
    const mockClient = createMockAnthropicClient('test');
    const config: AgentConfig = createMockAgentConfig({
      id: 'factory-agent',
      name: 'Factory Agent',
      provider: 'anthropic',
      model: 'claude-3-opus',
    });

    const agent = createClaudeAgent(config, undefined, {
      client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
    });

    expect(agent.id).toBe('factory-agent');
    expect(agent).toBeInstanceOf(ClaudeAgent);
  });

  it('should set toolkit when provided', () => {
    const mockClient = createMockAnthropicClient('test');
    const mockToolkit: AgentToolkit = createMockToolkit();

    const agent = createClaudeAgent(
      createMockAgentConfig({
        id: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
      }),
      mockToolkit,
      {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      }
    );

    expect(agent).toBeInstanceOf(ClaudeAgent);
  });
});
