import { describe, it, expect, vi } from 'vitest';
import { ChatGPTAgent, createChatGPTAgent } from '../../../src/agents/chatgpt.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import {
  createMockOpenAIClient,
  createMockOpenAIClientWithToolCalls,
  createMockContext,
  createMockAgentConfig,
  createMockToolkit,
  createJsonResponse,
} from '../../utils/index.js';

describe('ChatGPTAgent', () => {
  const defaultConfig: AgentConfig = createMockAgentConfig({
    id: 'chatgpt-test',
    name: 'ChatGPT Test',
    provider: 'openai',
    model: 'gpt-4-turbo',
  });

  const defaultContext: DebateContext = createMockContext({
    topic: 'Should AI be regulated?',
  });

  describe('constructor', () => {
    it('should create agent with custom client', () => {
      const mockClient = createMockOpenAIClient('test');
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      expect(agent.id).toBe('chatgpt-test');
      expect(agent.provider).toBe('openai');
    });
  });

  describe('generateResponse', () => {
    it('should generate response from OpenAI API', async () => {
      const mockResponse = createJsonResponse({
        position: 'AI should be regulated carefully',
        reasoning: 'To balance innovation and safety',
        confidence: 0.8,
      });

      const mockClient = createMockOpenAIClient(mockResponse);
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.agentId).toBe('chatgpt-test');
      expect(response.agentName).toBe('ChatGPT Test');
      expect(response.position).toBe('AI should be regulated carefully');
      expect(response.reasoning).toBe('To balance innovation and safety');
      expect(response.confidence).toBe(0.8);
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should call API with correct parameters', async () => {
      const mockClient = createMockOpenAIClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo',
          max_completion_tokens: 4096,
          temperature: 0.7,
        })
      );
    });

    it('should include system message', async () => {
      const mockClient = createMockOpenAIClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      const call = mockClient.chat.completions.create.mock.calls[0]?.[0];
      const systemMessage = call?.messages?.find((m: { role: string }) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage?.content).toContain('Should AI be regulated?');
    });

    it('should handle non-JSON response gracefully', async () => {
      const mockClient = createMockOpenAIClient('This is a plain text response');
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.position).toBeDefined();
      expect(response.confidence).toBe(0.5); // fallback
    });

    it('should handle empty response', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: { content: null, role: 'assistant' },
                  finish_reason: 'stop',
                },
              ],
            }),
          },
        },
      };

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.agentId).toBe('chatgpt-test');
      expect(response.confidence).toBe(0.5);
    });

    it('should include previous responses in messages', async () => {
      const mockClient = createMockOpenAIClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const contextWithPrevious: DebateContext = createMockContext({
        topic: 'Should AI be regulated?',
        previousResponses: [
          {
            agentId: 'other-agent',
            agentName: 'Other Agent',
            position: 'Different position',
            reasoning: 'Different reasoning',
            confidence: 0.6,
            timestamp: new Date(),
          },
        ],
      });

      await agent.generateResponse(contextWithPrevious);

      const call = mockClient.chat.completions.create.mock.calls[0]?.[0];
      const userMessage = call?.messages?.find((m: { role: string }) => m.role === 'user');
      expect(userMessage?.content).toContain('Other Agent');
      expect(userMessage?.content).toContain('Different position');
    });
  });

  describe('tool calls', () => {
    it('should handle function calls', async () => {
      const mockClient = createMockOpenAIClientWithToolCalls(
        'search_web',
        { query: 'AI regulation policies' },
        createJsonResponse({
          position: 'Based on research',
          reasoning: 'Found sources',
          confidence: 0.85,
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
              { title: 'Policy Article', url: 'https://example.com', snippet: 'Regulations...' },
            ],
          },
        }),
      });

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      expect(mockToolkit.executeTool).toHaveBeenCalledWith('search_web', {
        query: 'AI regulation policies',
      });
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('search_web');
      expect(response.citations).toHaveLength(1);
    });

    it('should provide tools to API when toolkit is set', async () => {
      const mockClient = createMockOpenAIClient(
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

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      await agent.generateResponse(defaultContext);

      const call = mockClient.chat.completions.create.mock.calls[0]?.[0];
      expect(call?.tools).toBeDefined();
      expect(call?.tools).toHaveLength(1);
      expect(call?.tools?.[0]?.function?.name).toBe('test_tool');
    });

    it('should extract citations from perplexity_search tool', async () => {
      const mockClient = createMockOpenAIClientWithToolCalls(
        'perplexity_search',
        { query: 'climate change policies', recency_filter: 'month' },
        createJsonResponse({
          position: 'Environmental policies are evolving',
          reasoning: 'Recent findings',
          confidence: 0.82,
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
            answer: 'Climate policies are being updated...',
            citations: [
              { title: 'Climate Report 2025', url: 'https://climate.example.com', snippet: 'Latest findings...' },
              { title: 'Policy Brief', url: 'https://policy.example.com', snippet: 'New regulations...' },
              { title: 'Scientific Study', url: 'https://science.example.com', snippet: 'Research data...' },
            ],
          },
        }),
      });

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      expect(mockToolkit.executeTool).toHaveBeenCalledWith('perplexity_search', {
        query: 'climate change policies',
        recency_filter: 'month',
      });
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('perplexity_search');
      expect(response.citations).toHaveLength(3);
      expect(response.citations?.[0]?.title).toBe('Climate Report 2025');
      expect(response.citations?.[1]?.title).toBe('Policy Brief');
      expect(response.citations?.[2]?.title).toBe('Scientific Study');
    });

    it('should handle tool execution errors', async () => {
      const mockClient = createMockOpenAIClientWithToolCalls(
        'failing_tool',
        { input: 'test' },
        createJsonResponse({
          position: 'Handled error',
          reasoning: 'Continued',
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

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);
      expect(response.toolCalls?.[0]?.output).toEqual({ error: 'Tool failed' });
    });
  });
});

describe('createChatGPTAgent', () => {
  it('should create agent with factory function', () => {
    const mockClient = createMockOpenAIClient('test');
    const config: AgentConfig = createMockAgentConfig({
      id: 'factory-chatgpt',
      name: 'Factory ChatGPT',
      provider: 'openai',
      model: 'gpt-4',
    });

    const agent = createChatGPTAgent(config, undefined, {
      client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
    });

    expect(agent.id).toBe('factory-chatgpt');
    expect(agent).toBeInstanceOf(ChatGPTAgent);
  });

  it('should set toolkit when provided', () => {
    const mockClient = createMockOpenAIClient('test');
    const mockToolkit: AgentToolkit = createMockToolkit();

    const agent = createChatGPTAgent(
      createMockAgentConfig({
        id: 'test',
        name: 'Test',
        provider: 'openai',
        model: 'gpt-4',
      }),
      mockToolkit,
      {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      }
    );

    expect(agent).toBeInstanceOf(ChatGPTAgent);
  });
});
