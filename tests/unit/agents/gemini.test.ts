import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAgent, createGeminiAgent } from '../../../src/agents/gemini.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';

// Mock GoogleGenAI client for new @google/genai SDK
const createMockClient = (
  responseText: string,
  functionCalls?: Array<{ id?: string; name: string; args: unknown }>
) => {
  let callCount = 0;

  const mockSendMessage = vi.fn().mockImplementation(() => {
    callCount++;
    if (functionCalls && callCount === 1) {
      return Promise.resolve({
        text: responseText,
        functionCalls: functionCalls,
      });
    }
    return Promise.resolve({
      text: responseText,
      functionCalls: undefined,
    });
  });

  return {
    chats: {
      create: vi.fn().mockReturnValue({
        sendMessage: mockSendMessage,
        getHistory: vi.fn().mockReturnValue([]),
      }),
    },
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: 'ok',
      }),
    },
  };
};

describe('GeminiAgent', () => {
  const defaultConfig: AgentConfig = {
    id: 'gemini-test',
    name: 'Gemini Test',
    provider: 'google',
    model: 'gemini-3-flash-preview',
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create agent with custom client', () => {
      const mockClient = createMockClient('test');
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      expect(agent.id).toBe('gemini-test');
      expect(agent.provider).toBe('google');
    });
  });

  describe('generateResponse', () => {
    it('should generate response from Gemini API', async () => {
      const mockResponse = JSON.stringify({
        position: 'AI should be regulated',
        reasoning: 'To ensure safety and fairness',
        confidence: 0.85,
      });

      const mockClient = createMockClient(mockResponse);
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.agentId).toBe('gemini-test');
      expect(response.agentName).toBe('Gemini Test');
      expect(response.position).toBe('AI should be regulated');
      expect(response.reasoning).toBe('To ensure safety and fairness');
      expect(response.confidence).toBe(0.85);
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should handle non-JSON response gracefully', async () => {
      const mockClient = createMockClient('This is a plain text response without JSON');
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.position).toBeDefined();
      expect(response.reasoning).toContain('plain text response');
      expect(response.confidence).toBe(0.5); // fallback
    });

    it('should handle empty response text gracefully', async () => {
      // Simulate Gemini returning empty text (e.g., thinking models or tool-only responses)
      const mockClient = createMockClient('');
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should never return empty strings - fallback to default messages
      expect(response.position).toBe('Unable to determine position');
      expect(response.reasoning).toBe('Unable to determine reasoning');
      expect(response.confidence).toBe(0.5);
    });

    it('should handle undefined response text gracefully', async () => {
      // Simulate Gemini returning undefined text
      const mockClient = {
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockResolvedValue({
              text: undefined,
              functionCalls: undefined,
            }),
            getHistory: vi.fn().mockReturnValue([]),
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      // Should never return empty strings - fallback to default messages
      expect(response.position).toBe('Unable to determine position');
      expect(response.reasoning).toBe('Unable to determine reasoning');
      expect(response.confidence).toBe(0.5);
    });

    it('should clamp confidence to 0-1 range', async () => {
      const mockResponse = JSON.stringify({
        position: 'Test',
        reasoning: 'Test',
        confidence: 1.5, // Above 1
      });

      const mockClient = createMockClient(mockResponse);
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.confidence).toBe(1);
    });

    it('should include previous responses in context', async () => {
      const mockClient = createMockClient(
        '{"position":"test","reasoning":"test","confidence":0.5}'
      );
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
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

      const response = await agent.generateResponse(contextWithPrevious);
      expect(response.position).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when API responds', async () => {
      const mockClient = createMockClient('test');
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      const result = await agent.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return unhealthy when API fails', async () => {
      const mockClient = {
        chats: {
          create: vi.fn(),
        },
        models: {
          generateContent: vi.fn().mockRejectedValue(new Error('API Error')),
        },
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      const result = await agent.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('API Error');
    });
  });

  describe('tool use', () => {
    it('should handle function calling', async () => {
      let callCount = 0;
      const mockClient = {
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({
                  text: '',
                  functionCalls: [
                    { id: 'call-1', name: 'search_web', args: { query: 'AI regulation' } },
                  ],
                });
              }
              return Promise.resolve({
                text: '{"position":"Based on research","reasoning":"Found relevant sources","confidence":0.9}',
                functionCalls: undefined,
              });
            }),
            getHistory: vi.fn().mockReturnValue([]),
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const mockToolkit: AgentToolkit = {
        getTools: () => [
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
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
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

    it('should handle tool execution errors', async () => {
      let callCount = 0;
      const mockClient = {
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({
                  text: '',
                  functionCalls: [{ id: 'call-1', name: 'failing_tool', args: { input: 'test' } }],
                });
              }
              return Promise.resolve({
                text: '{"position":"Handled error","reasoning":"Continued despite tool failure","confidence":0.6}',
                functionCalls: undefined,
              });
            }),
            getHistory: vi.fn().mockReturnValue([]),
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const mockToolkit: AgentToolkit = {
        getTools: () => [
          {
            name: 'failing_tool',
            description: 'A failing tool',
            parameters: { input: { type: 'string', description: 'Input' } },
          },
        ],
        executeTool: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);
      expect(response.toolCalls?.[0]?.output).toEqual({ error: 'Tool failed' });
    });

    it('should extract position/reasoning from submit_response tool call', async () => {
      let callCount = 0;
      const mockClient = {
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({
                  text: '',
                  functionCalls: [
                    {
                      id: 'call-1',
                      name: 'submit_response',
                      args: {
                        position: 'AI should be carefully regulated to balance innovation and safety',
                        reasoning:
                          'Regulation is necessary to prevent misuse while ensuring technological progress continues.',
                        confidence: 0.85,
                      },
                    },
                  ],
                });
              }
              return Promise.resolve({
                text: '제 입장을 제출했습니다. 요약하면 AI 규제는 신중하게 접근해야 한다는 것입니다.',
                functionCalls: undefined,
              });
            }),
            getHistory: vi.fn().mockReturnValue([]),
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const mockToolkit: AgentToolkit = {
        getTools: () => [
          {
            name: 'submit_response',
            description: 'Submit your response',
            parameters: {
              position: { type: 'string', description: 'Position' },
              reasoning: { type: 'string', description: 'Reasoning' },
              confidence: { type: 'number', description: 'Confidence' },
            },
          },
        ],
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          data: {
            position: 'AI should be carefully regulated to balance innovation and safety',
            reasoning:
              'Regulation is necessary to prevent misuse while ensuring technological progress continues.',
            confidence: 0.85,
          },
        }),
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      // Should extract from tool call, NOT from text response
      expect(response.position).toBe(
        'AI should be carefully regulated to balance innovation and safety'
      );
      expect(response.reasoning).toBe(
        'Regulation is necessary to prevent misuse while ensuring technological progress continues.'
      );
      expect(response.confidence).toBe(0.85);

      // Should record the tool call
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('submit_response');
    });
  });
});

describe('createGeminiAgent', () => {
  it('should create agent with factory function', () => {
    const mockClient = createMockClient('test');
    const config: AgentConfig = {
      id: 'factory-agent',
      name: 'Factory Agent',
      provider: 'google',
      model: 'gemini-3-flash-preview',
    };

    const agent = createGeminiAgent(config, undefined, {
      client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
    });

    expect(agent.id).toBe('factory-agent');
    expect(agent).toBeInstanceOf(GeminiAgent);
  });

  it('should set toolkit when provided', () => {
    const mockClient = createMockClient('test');
    const mockToolkit: AgentToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
    };

    const agent = createGeminiAgent(
      {
        id: 'test',
        name: 'Test',
        provider: 'google',
        model: 'gemini',
      },
      mockToolkit,
      {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      }
    );

    expect(agent).toBeInstanceOf(GeminiAgent);
  });
});
