import { describe, it, expect, vi } from 'vitest';
import { ChatGPTAgent, createChatGPTAgent } from '../../../src/agents/chatgpt.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';

// Mock OpenAI client
const createMockClient = (responseContent: string, finishReason = 'stop') => {
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
        }),
      },
    },
  };
};

// Mock client that simulates tool calls
const createMockClientWithToolCalls = (
  toolCallName: string,
  toolCallArgs: Record<string, unknown>,
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
                        id: 'call-1',
                        type: 'function',
                        function: {
                          name: toolCallName,
                          arguments: JSON.stringify(toolCallArgs),
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

describe('ChatGPTAgent', () => {
  const defaultConfig: AgentConfig = {
    id: 'chatgpt-test',
    name: 'ChatGPT Test',
    provider: 'openai',
    model: 'gpt-4-turbo',
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
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      expect(agent.id).toBe('chatgpt-test');
      expect(agent.provider).toBe('openai');
    });
  });

  describe('generateResponse', () => {
    it('should generate response from OpenAI API', async () => {
      const mockResponse = JSON.stringify({
        position: 'AI should be regulated carefully',
        reasoning: 'To balance innovation and safety',
        confidence: 0.8,
      });

      const mockClient = createMockClient(mockResponse);
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
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
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
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
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
      const mockClient = createMockClient('This is a plain text response');
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
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
      const agent = new ChatGPTAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      });

      const contextWithPrevious: DebateContext = {
        ...defaultContext,
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
      };

      await agent.generateResponse(contextWithPrevious);

      const call = mockClient.chat.completions.create.mock.calls[0]?.[0];
      const userMessage = call?.messages?.find((m: { role: string }) => m.role === 'user');
      expect(userMessage?.content).toContain('Other Agent');
      expect(userMessage?.content).toContain('Different position');
    });
  });

  describe('tool calls', () => {
    it('should handle function calls', async () => {
      const mockClient = createMockClientWithToolCalls(
        'search_web',
        { query: 'AI regulation policies' },
        '{"position":"Based on research","reasoning":"Found sources","confidence":0.85}'
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
            { title: 'Policy Article', url: 'https://example.com', snippet: 'Regulations...' },
          ],
        }),
      };

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

    it('should handle tool execution errors', async () => {
      const mockClient = createMockClientWithToolCalls(
        'failing_tool',
        { input: 'test' },
        '{"position":"Handled error","reasoning":"Continued","confidence":0.6}'
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
    const mockClient = createMockClient('test');
    const config: AgentConfig = {
      id: 'factory-chatgpt',
      name: 'Factory ChatGPT',
      provider: 'openai',
      model: 'gpt-4',
    };

    const agent = createChatGPTAgent(config, undefined, {
      client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
    });

    expect(agent.id).toBe('factory-chatgpt');
    expect(agent).toBeInstanceOf(ChatGPTAgent);
  });

  it('should set toolkit when provided', () => {
    const mockClient = createMockClient('test');
    const mockToolkit: AgentToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
    };

    const agent = createChatGPTAgent(
      {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        model: 'gpt-4',
      },
      mockToolkit,
      {
        client: mockClient as unknown as ConstructorParameters<typeof ChatGPTAgent>[1]['client'],
      }
    );

    expect(agent).toBeInstanceOf(ChatGPTAgent);
  });
});
