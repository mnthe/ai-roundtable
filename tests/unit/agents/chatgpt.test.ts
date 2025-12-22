import { describe, it, expect, vi } from 'vitest';
import { ChatGPTAgent, createChatGPTAgent } from '../../../src/agents/chatgpt.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import {
  createMockResponsesClient,
  createMockResponsesClientWithWebSearch,
  createMockResponsesClientWithToolCalls,
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
      const mockClient = createMockResponsesClient('test');
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      expect(agent.id).toBe('chatgpt-test');
      expect(agent.provider).toBe('openai');
    });

    it('should enable web search by default', () => {
      const mockClient = createMockResponsesClient('test');
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      expect(agent).toBeDefined();
    });

    it('should allow disabling web search', () => {
      const mockClient = createMockResponsesClient('test');
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
        webSearch: { enabled: false },
      });

      expect(agent).toBeDefined();
    });
  });

  describe('generateResponse', () => {
    it('should generate response from Responses API', async () => {
      const mockResponse = createJsonResponse({
        position: 'AI should be regulated carefully',
        reasoning: 'To balance innovation and safety',
        confidence: 0.8,
      });

      const mockClient = createMockResponsesClient(mockResponse);
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

    it('should call Responses API with correct parameters', async () => {
      const mockClient = createMockResponsesClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      expect(mockClient.responses.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo',
          max_output_tokens: 4096,
          temperature: 0.7,
        })
      );
    });

    it('should include instructions (system prompt)', async () => {
      const mockClient = createMockResponsesClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      const call = mockClient.responses.create.mock.calls[0]?.[0];
      expect(call?.instructions).toContain('Should AI be regulated?');
    });

    it('should handle non-JSON response gracefully', async () => {
      const mockClient = createMockResponsesClient('This is a plain text response');
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.position).toBeDefined();
      expect(response.confidence).toBe(0.5); // fallback
    });

    it('should handle empty response', async () => {
      const mockClient = {
        responses: {
          create: vi.fn().mockResolvedValue({
            id: 'resp-1',
            output_text: '',
            output: [
              {
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [
                  {
                    type: 'output_text',
                    text: '',
                    annotations: [],
                  },
                ],
              },
            ],
          }),
        },
      };

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.agentId).toBe('chatgpt-test');
      expect(response.confidence).toBe(0.5);
    });

    it('should include previous responses in input', async () => {
      const mockClient = createMockResponsesClient(
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

      const call = mockClient.responses.create.mock.calls[0]?.[0];
      expect(call?.input).toContain('Other Agent');
      expect(call?.input).toContain('Different position');
    });
  });

  describe('native web search', () => {
    it('should include web_search tool when enabled', async () => {
      const mockClient = createMockResponsesClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
        webSearch: { enabled: true },
      });

      await agent.generateResponse(defaultContext);

      const call = mockClient.responses.create.mock.calls[0]?.[0];
      const webSearchTool = call?.tools?.find((t: { type: string }) => t.type === 'web_search');
      expect(webSearchTool).toBeDefined();
    });

    it('should extract citations from web search results', async () => {
      const mockClient = createMockResponsesClientWithWebSearch(
        createJsonResponse({
          position: 'Based on research',
          reasoning: 'Found relevant sources',
          confidence: 0.85,
        }),
        [
          { title: 'AI Regulation Article', url: 'https://example.com/ai-regulation' },
          { title: 'Policy Brief', url: 'https://policy.example.com' },
        ]
      );

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.citations).toHaveLength(2);
      expect(response.citations?.[0]?.title).toBe('AI Regulation Article');
      expect(response.citations?.[0]?.url).toBe('https://example.com/ai-regulation');
      expect(response.citations?.[1]?.title).toBe('Policy Brief');
    });

    it('should record web_search tool call when used', async () => {
      const mockClient = createMockResponsesClientWithWebSearch(
        createJsonResponse({
          position: 'Based on research',
          reasoning: 'Found sources',
          confidence: 0.85,
        }),
        [{ title: 'Source', url: 'https://example.com' }]
      );

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.toolCalls?.some((tc) => tc.toolName === 'web_search')).toBe(true);
    });

    it('should not include web_search tool when disabled', async () => {
      const mockClient = createMockResponsesClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
        webSearch: { enabled: false },
      });

      await agent.generateResponse(defaultContext);

      const call = mockClient.responses.create.mock.calls[0]?.[0];
      const webSearchTool = call?.tools?.find((t: { type: string }) => t.type === 'web_search');
      expect(webSearchTool).toBeUndefined();
    });
  });

  describe('function tool calls', () => {
    it('should handle function calls', async () => {
      const mockClient = createMockResponsesClientWithToolCalls(
        'get_context',
        {},
        createJsonResponse({
          position: 'Based on context',
          reasoning: 'Used debate context',
          confidence: 0.85,
        })
      );

      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'get_context',
            description: 'Get debate context',
            parameters: {},
          },
        ],
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          data: {
            topic: 'Test topic',
            mode: 'collaborative',
          },
        }),
      });

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      expect(mockToolkit.executeTool).toHaveBeenCalledWith('get_context', {});
      expect(response.toolCalls?.some((tc) => tc.toolName === 'get_context')).toBe(true);
    });

    it('should provide function tools to API when toolkit is set', async () => {
      const mockClient = createMockResponsesClient(
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

      const call = mockClient.responses.create.mock.calls[0]?.[0];
      const functionTool = call?.tools?.find(
        (t: { type: string; name?: string }) => t.type === 'function' && t.name === 'test_tool'
      );
      expect(functionTool).toBeDefined();
    });

    it('should handle tool execution errors', async () => {
      const mockClient = createMockResponsesClientWithToolCalls(
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
      expect(response.toolCalls?.some((tc) => tc.output && 'error' in tc.output)).toBe(true);
    });
  });
});

describe('createChatGPTAgent', () => {
  it('should create agent with factory function', () => {
    const mockClient = createMockResponsesClient('test');
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
    const mockClient = createMockResponsesClient('test');
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
