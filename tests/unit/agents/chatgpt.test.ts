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

  describe('selective function tools', () => {
    // ChatGPT agent passes selective function tools to the Responses API:
    // - EXCLUDED: get_context (context in prompt, causes model to skip web search)
    // - EXCLUDED: submit_response (handled by BaseAgent validation)
    // - INCLUDED: fact_check and other tools that complement web search

    it('should pass fact_check tool but exclude get_context', async () => {
      const mockClient = createMockResponsesClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'get_context',
            description: 'Get debate context',
            parameters: {},
          },
          {
            name: 'fact_check',
            description: 'Verify claims',
            parameters: { claim: { type: 'string', description: 'Claim to verify' } },
          },
        ],
      });

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      await agent.generateResponse(defaultContext);

      const call = mockClient.responses.create.mock.calls[0]?.[0];
      const tools = call?.tools ?? [];

      // Should have web_search + fact_check (get_context excluded)
      expect(tools).toHaveLength(2);
      expect(tools.some((t: { type: string }) => t.type === 'web_search')).toBe(true);
      expect(tools.some((t: { type: string; name?: string }) => t.name === 'fact_check')).toBe(
        true
      );
      expect(tools.some((t: { type: string; name?: string }) => t.name === 'get_context')).toBe(
        false
      );
    });

    it('should only include web_search when toolkit only has excluded tools', async () => {
      const mockClient = createMockResponsesClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'get_context',
            description: 'Get debate context',
            parameters: {},
          },
          {
            name: 'submit_response',
            description: 'Submit response',
            parameters: {},
          },
        ],
      });

      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      await agent.generateResponse(defaultContext);

      const call = mockClient.responses.create.mock.calls[0]?.[0];
      // Should only have web_search tool (all toolkit tools are excluded)
      expect(call?.tools).toHaveLength(1);
      expect(call?.tools?.[0]?.type).toBe('web_search');
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
