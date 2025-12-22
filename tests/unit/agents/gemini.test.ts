import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAgent, createGeminiAgent } from '../../../src/agents/gemini.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';
import {
  createMockGeminiClient,
  createMockContext,
  createMockAgentConfig,
  createMockToolkit,
  createJsonResponse,
} from '../../utils/index.js';

describe('GeminiAgent', () => {
  const defaultConfig: AgentConfig = createMockAgentConfig({
    id: 'gemini-test',
    name: 'Gemini Test',
    provider: 'google',
    model: 'gemini-3-flash-preview',
  });

  const defaultContext: DebateContext = createMockContext({
    topic: 'Should AI be regulated?',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create agent with custom client', () => {
      const mockClient = createMockGeminiClient('test');
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      expect(agent.id).toBe('gemini-test');
      expect(agent.provider).toBe('google');
    });
  });

  describe('generateResponse', () => {
    it('should generate response from Gemini API', async () => {
      const mockResponse = createJsonResponse({
        position: 'AI should be regulated',
        reasoning: 'To ensure safety and fairness',
        confidence: 0.85,
      });

      const mockClient = createMockGeminiClient(mockResponse);
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
      const mockClient = createMockGeminiClient('This is a plain text response without JSON');
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
      const mockClient = createMockGeminiClient('');
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
      const mockResponse = createJsonResponse({
        position: 'Test',
        reasoning: 'Test',
        confidence: 1.5,
      });

      const mockClient = createMockGeminiClient(mockResponse);
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.confidence).toBe(1);
    });

    it('should include previous responses in context', async () => {
      const mockClient = createMockGeminiClient(
        createJsonResponse({ position: 'test', reasoning: 'test', confidence: 0.5 })
      );
      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
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

      const response = await agent.generateResponse(contextWithPrevious);
      expect(response.position).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when API responds', async () => {
      const mockClient = createMockGeminiClient('test');
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
    it('should handle function calling in Two-Phase approach', async () => {
      // Two-Phase approach: Phase 1 (Google Search) -> Phase 2 (Function Calling)
      // This test verifies Phase 2 function calling works correctly
      let chatCreateCount = 0;

      const mockClient = {
        chats: {
          create: vi.fn().mockImplementation(() => {
            chatCreateCount++;

            if (chatCreateCount === 1) {
              // Phase 1: Google Search grounding
              return {
                sendMessage: vi.fn().mockResolvedValue({
                  text: 'Phase 1 search results about AI regulation',
                  candidates: [
                    {
                      groundingMetadata: {
                        groundingChunks: [
                          { web: { title: 'AI Policy', uri: 'https://ai-policy.com' } },
                        ],
                        webSearchQueries: ['AI regulation'],
                      },
                    },
                  ],
                }),
              };
            }

            // Phase 2: Function calling
            let phase2CallCount = 0;
            return {
              sendMessage: vi.fn().mockImplementation(() => {
                phase2CallCount++;
                if (phase2CallCount === 1) {
                  return Promise.resolve({
                    text: '',
                    functionCalls: [
                      { id: 'call-1', name: 'fact_check', args: { claim: 'AI regulation helps' } },
                    ],
                  });
                }
                return Promise.resolve({
                  text: createJsonResponse({
                    position: 'Based on research and verification',
                    reasoning: 'Found and verified sources',
                    confidence: 0.9,
                  }),
                  functionCalls: undefined,
                });
              }),
            };
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
          {
            name: 'fact_check',
            description: 'Verify claims',
            parameters: { claim: { type: 'string', description: 'Claim to verify' } },
          },
        ],
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          data: { verified: true, sources: ['https://source.com'] },
        }),
      });

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      // Verify Two-Phase: 2 chat sessions created
      expect(mockClient.chats.create).toHaveBeenCalledTimes(2);

      // Verify function was called in Phase 2
      expect(mockToolkit.executeTool).toHaveBeenCalledWith('fact_check', {
        claim: 'AI regulation helps',
      });

      // Verify toolCalls includes both google_search (Phase 1) and fact_check (Phase 2)
      expect(response.toolCalls?.some((tc) => tc.toolName === 'google_search')).toBe(true);
      expect(response.toolCalls?.some((tc) => tc.toolName === 'fact_check')).toBe(true);

      // Verify citations from Phase 1 grounding
      expect(response.citations?.some((c) => c.title === 'AI Policy')).toBe(true);
    });

    it('should handle tool execution errors in Two-Phase', async () => {
      let chatCreateCount = 0;

      const mockClient = {
        chats: {
          create: vi.fn().mockImplementation(() => {
            chatCreateCount++;

            if (chatCreateCount === 1) {
              // Phase 1: Google Search grounding
              return {
                sendMessage: vi.fn().mockResolvedValue({
                  text: 'Phase 1 results',
                  candidates: [{ groundingMetadata: {} }],
                }),
              };
            }

            // Phase 2: Function calling with error
            let phase2CallCount = 0;
            return {
              sendMessage: vi.fn().mockImplementation(() => {
                phase2CallCount++;
                if (phase2CallCount === 1) {
                  return Promise.resolve({
                    text: '',
                    functionCalls: [{ id: 'call-1', name: 'failing_tool', args: { input: 'test' } }],
                  });
                }
                return Promise.resolve({
                  text: createJsonResponse({
                    position: 'Handled error',
                    reasoning: 'Continued despite tool failure',
                    confidence: 0.6,
                  }),
                  functionCalls: undefined,
                });
              }),
            };
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

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

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      // Find the failing_tool call (not google_search)
      const failingToolCall = response.toolCalls?.find((tc) => tc.toolName === 'failing_tool');
      expect(failingToolCall?.output).toEqual({ error: 'Tool failed' });
    });

    it('should extract position/reasoning from submit_response tool call in Two-Phase', async () => {
      let chatCreateCount = 0;

      const mockClient = {
        chats: {
          create: vi.fn().mockImplementation(() => {
            chatCreateCount++;

            if (chatCreateCount === 1) {
              // Phase 1: Google Search grounding
              return {
                sendMessage: vi.fn().mockResolvedValue({
                  text: 'Phase 1 research on AI regulation',
                  candidates: [{ groundingMetadata: {} }],
                }),
              };
            }

            // Phase 2: Function calling with submit_response
            let phase2CallCount = 0;
            return {
              sendMessage: vi.fn().mockImplementation(() => {
                phase2CallCount++;
                if (phase2CallCount === 1) {
                  return Promise.resolve({
                    text: '',
                    functionCalls: [
                      {
                        id: 'call-1',
                        name: 'submit_response',
                        args: {
                          position:
                            'AI should be carefully regulated to balance innovation and safety',
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
            };
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const mockToolkit: AgentToolkit = createMockToolkit({
        tools: [
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
      });

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

      // Should record the submit_response tool call (Phase 2)
      const submitResponseCall = response.toolCalls?.find(
        (tc) => tc.toolName === 'submit_response'
      );
      expect(submitResponseCall).toBeDefined();
    });
  });

  describe('google search grounding', () => {
    it('should include google_search tool by default', async () => {
      const mockResponse = createJsonResponse({
        position: 'AI regulation needed',
        reasoning: 'Based on research',
        confidence: 0.85,
      });

      let capturedConfig: Record<string, unknown> | undefined;
      const mockClient = {
        chats: {
          create: vi.fn().mockImplementation((params) => {
            capturedConfig = params?.config;
            return {
              sendMessage: vi.fn().mockResolvedValue({
                text: mockResponse,
                functionCalls: undefined,
                candidates: undefined,
              }),
              getHistory: vi.fn().mockReturnValue([]),
            };
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      // Should include google_search in tools by default
      expect(capturedConfig?.tools).toBeDefined();
      const tools = capturedConfig?.tools as Array<{ googleSearch?: object }>;
      const hasGoogleSearch = tools.some((t) => t.googleSearch !== undefined);
      expect(hasGoogleSearch).toBe(true);
    });

    it('should allow disabling google_search', async () => {
      const mockResponse = createJsonResponse({
        position: 'Test',
        reasoning: 'Test',
        confidence: 0.8,
      });

      let capturedConfig: Record<string, unknown> | undefined;
      const mockClient = {
        chats: {
          create: vi.fn().mockImplementation((params) => {
            capturedConfig = params?.config;
            return {
              sendMessage: vi.fn().mockResolvedValue({
                text: mockResponse,
                functionCalls: undefined,
                candidates: undefined,
              }),
              getHistory: vi.fn().mockReturnValue([]),
            };
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
        googleSearch: { enabled: false },
      });

      await agent.generateResponse(defaultContext);

      // Should NOT include google_search when disabled
      const tools = capturedConfig?.tools as Array<{ googleSearch?: object }> | undefined;
      if (tools) {
        const hasGoogleSearch = tools.some((t) => t.googleSearch !== undefined);
        expect(hasGoogleSearch).toBe(false);
      }
    });

    it('should extract citations from grounding metadata', async () => {
      const mockResponse = createJsonResponse({
        position: 'AI needs regulation',
        reasoning: 'Based on web research',
        confidence: 0.9,
      });

      const mockClient = {
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockResolvedValue({
              text: mockResponse,
              functionCalls: undefined,
              candidates: [
                {
                  groundingMetadata: {
                    webSearchQueries: ['AI regulation 2025'],
                    groundingChunks: [
                      {
                        web: {
                          title: 'AI Regulation Guide',
                          uri: 'https://example.com/ai-regulation',
                        },
                      },
                      {
                        web: {
                          title: 'Policy Update',
                          uri: 'https://example.com/policy',
                        },
                      },
                    ],
                  },
                },
              ],
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

      // Should extract citations from grounding metadata
      expect(response.citations).toHaveLength(2);
      expect(response.citations?.[0]?.title).toBe('AI Regulation Guide');
      expect(response.citations?.[0]?.url).toBe('https://example.com/ai-regulation');
      expect(response.citations?.[1]?.title).toBe('Policy Update');
      expect(response.citations?.[1]?.url).toBe('https://example.com/policy');
    });

    it('should record google_search tool call from grounding metadata', async () => {
      const mockResponse = createJsonResponse({
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.8,
      });

      const mockClient = {
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockResolvedValue({
              text: mockResponse,
              functionCalls: undefined,
              candidates: [
                {
                  groundingMetadata: {
                    webSearchQueries: ['test query'],
                    groundingChunks: [
                      {
                        web: {
                          title: 'Test Result',
                          uri: 'https://test.com',
                        },
                      },
                    ],
                  },
                },
              ],
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

      // Should record google_search tool call
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('google_search');
      expect(response.toolCalls?.[0]?.input).toEqual({ queries: ['test query'] });
      expect(response.toolCalls?.[0]?.output).toEqual({
        success: true,
        data: {
          results: [{ title: 'Test Result', url: 'https://test.com' }],
        },
      });
    });

    it('should handle grounding metadata without chunks', async () => {
      const mockResponse = createJsonResponse({
        position: 'Test',
        reasoning: 'Test',
        confidence: 0.7,
      });

      const mockClient = {
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockResolvedValue({
              text: mockResponse,
              functionCalls: undefined,
              candidates: [
                {
                  groundingMetadata: {
                    webSearchQueries: ['query'],
                    groundingChunks: [],
                  },
                },
              ],
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

      // Should handle empty grounding chunks gracefully
      expect(response.citations?.length ?? 0).toBe(0);
      expect(response.toolCalls?.length ?? 0).toBe(0);
    });

    it('should handle missing grounding metadata', async () => {
      const mockResponse = createJsonResponse({
        position: 'Test',
        reasoning: 'Test',
        confidence: 0.7,
      });

      const mockClient = {
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockResolvedValue({
              text: mockResponse,
              functionCalls: undefined,
              candidates: [{ groundingMetadata: undefined }],
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

      // Should handle missing grounding metadata gracefully
      expect(response.citations?.length ?? 0).toBe(0);
      expect(response.toolCalls?.length ?? 0).toBe(0);
    });

    it('should use light model for Phase 1 by default', async () => {
      const mockResponse = createJsonResponse({
        position: 'Test',
        reasoning: 'Test',
        confidence: 0.8,
      });

      const capturedModels: string[] = [];
      const mockClient = {
        chats: {
          create: vi.fn().mockImplementation((params) => {
            capturedModels.push(params?.model);
            return {
              sendMessage: vi.fn().mockResolvedValue({
                text: mockResponse,
                functionCalls: undefined,
                candidates: [{ groundingMetadata: {} }],
              }),
              getHistory: vi.fn().mockReturnValue([]),
            };
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
        // useLightModelForSearch defaults to true
      });

      await agent.generateResponse(defaultContext);

      // Phase 1 should use light model (gemini-2.5-flash-lite)
      expect(capturedModels[0]).toBe('gemini-2.5-flash-lite');
    });

    it('should use heavy model for Phase 1 when useLightModelForSearch is false', async () => {
      const mockResponse = createJsonResponse({
        position: 'Test',
        reasoning: 'Test',
        confidence: 0.8,
      });

      const capturedModels: string[] = [];
      const mockClient = {
        chats: {
          create: vi.fn().mockImplementation((params) => {
            capturedModels.push(params?.model);
            return {
              sendMessage: vi.fn().mockResolvedValue({
                text: mockResponse,
                functionCalls: undefined,
                candidates: [{ groundingMetadata: {} }],
              }),
              getHistory: vi.fn().mockReturnValue([]),
            };
          }),
        },
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: 'ok' }),
        },
      };

      const agent = new GeminiAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
        useLightModelForSearch: false,
      });

      await agent.generateResponse(defaultContext);

      // Phase 1 should use heavy model when disabled
      expect(capturedModels[0]).toBe('gemini-3-flash-preview');
    });
  });
});

describe('createGeminiAgent', () => {
  it('should create agent with factory function', () => {
    const mockClient = createMockGeminiClient('test');
    const config: AgentConfig = createMockAgentConfig({
      id: 'factory-agent',
      name: 'Factory Agent',
      provider: 'google',
      model: 'gemini-3-flash-preview',
    });

    const agent = createGeminiAgent(config, undefined, {
      client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
    });

    expect(agent.id).toBe('factory-agent');
    expect(agent).toBeInstanceOf(GeminiAgent);
  });

  it('should set toolkit when provided', () => {
    const mockClient = createMockGeminiClient('test');
    const mockToolkit: AgentToolkit = createMockToolkit();

    const agent = createGeminiAgent(
      createMockAgentConfig({
        id: 'test',
        name: 'Test',
        provider: 'google',
        model: 'gemini',
      }),
      mockToolkit,
      {
        client: mockClient as unknown as ConstructorParameters<typeof GeminiAgent>[1]['client'],
      }
    );

    expect(agent).toBeInstanceOf(GeminiAgent);
  });
});
