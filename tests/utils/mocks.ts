/**
 * Common mock utilities for AI Roundtable tests
 *
 * This module provides reusable mock factories for:
 * - API clients (Anthropic, OpenAI, Google/Gemini, Perplexity)
 * - Debate contexts
 * - Agent responses
 * - Toolkits
 */

import { vi } from 'vitest';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  DebateMode,
  AIProvider,
  Citation,
  ToolCallRecord,
} from '../../src/types/index.js';
import type { AgentTool, AgentToolkit, ToolDefinition } from '../../src/tools/types.js';
import { MockAgent } from '../../src/agents/index.js';

// =============================================================================
// Mock Anthropic Client
// =============================================================================

/**
 * Creates a mock Anthropic client for Claude agent tests
 */
export function createMockAnthropicClient(responseContent: string, stopReason = 'end_turn') {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseContent }],
        stop_reason: stopReason,
      }),
    },
  };
}

/**
 * Creates a mock Anthropic client that simulates tool use
 */
export function createMockAnthropicClientWithToolUse(
  toolCallName: string,
  toolCallInput: unknown,
  _toolResult: unknown,
  finalResponse: string
) {
  let callCount = 0;
  return {
    messages: {
      create: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: toolCallName,
                input: toolCallInput,
              },
            ],
            stop_reason: 'tool_use',
          });
        }
        return Promise.resolve({
          content: [{ type: 'text', text: finalResponse }],
          stop_reason: 'end_turn',
        });
      }),
    },
  };
}

// =============================================================================
// Mock OpenAI Client (ChatGPT & Perplexity)
// =============================================================================

/**
 * Extended mock response metadata for Perplexity
 * Matches the official @perplexity-ai/perplexity_ai SDK types:
 * - citations: Array of string URLs (deprecated field)
 * - search_results: Array of objects with url, title, date, snippet (new field)
 */
export interface MockPerplexityMetadata {
  citations?: Array<string>;
  search_results?: Array<{ url: string; title?: string; date?: string; snippet?: string }>;
}

/**
 * Creates a mock OpenAI client for ChatGPT agent tests
 */
export function createMockOpenAIClient(responseContent: string, finishReason = 'stop') {
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
}

/**
 * Creates a mock OpenAI client that simulates tool calls
 */
export function createMockOpenAIClientWithToolCalls(
  toolCallName: string,
  toolCallArgs: Record<string, unknown>,
  finalResponse: string
) {
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
}

/**
 * Creates a mock Perplexity client (OpenAI-compatible with extensions)
 */
export function createMockPerplexityClient(
  responseContent: string,
  finishReason = 'stop',
  metadata?: MockPerplexityMetadata
) {
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
          search_results: metadata?.search_results,
        }),
      },
    },
  };
}

/**
 * Creates a mock Perplexity client that simulates tool use
 */
export function createMockPerplexityClientWithToolUse(
  toolCallName: string,
  toolCallArgs: string,
  finalResponse: string
) {
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
}

// =============================================================================
// Mock OpenAI Responses API Client (ChatGPT with native web search)
// =============================================================================

/**
 * Creates a mock OpenAI Responses API client for ChatGPT agent tests
 * The Responses API uses `client.responses.create()` instead of `chat.completions.create()`
 */
export function createMockResponsesClient(
  responseText: string,
  urlCitations?: Array<{ title: string; url: string }>
) {
  const annotations =
    urlCitations?.map((c) => ({
      type: 'url_citation' as const,
      title: c.title,
      url: c.url,
      start_index: 0,
      end_index: 10,
    })) ?? [];

  return {
    responses: {
      create: vi.fn().mockResolvedValue({
        id: 'resp-1',
        output_text: responseText,
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: responseText,
                annotations,
              },
            ],
          },
        ],
      }),
    },
  };
}

/**
 * Creates a mock OpenAI Responses API client with web search results
 */
export function createMockResponsesClientWithWebSearch(
  responseText: string,
  webSearchResults: Array<{ title: string; url: string }>
) {
  const annotations = webSearchResults.map((r) => ({
    type: 'url_citation' as const,
    title: r.title,
    url: r.url,
    start_index: 0,
    end_index: 10,
  }));

  return {
    responses: {
      create: vi.fn().mockResolvedValue({
        id: 'resp-1',
        output_text: responseText,
        output: [
          {
            type: 'web_search_call',
            id: 'ws-1',
            status: 'completed',
          },
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: responseText,
                annotations,
              },
            ],
          },
        ],
      }),
    },
  };
}

/**
 * Creates a mock OpenAI Responses API client that simulates function tool calls
 */
export function createMockResponsesClientWithToolCalls(
  toolCallName: string,
  toolCallArgs: Record<string, unknown>,
  finalResponse: string
) {
  let callCount = 0;
  return {
    responses: {
      create: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            id: 'resp-1',
            output_text: '',
            output: [
              {
                type: 'function_call',
                id: 'call-1',
                name: toolCallName,
                arguments: JSON.stringify(toolCallArgs),
                status: 'completed',
              },
            ],
          });
        }
        return Promise.resolve({
          id: 'resp-2',
          output_text: finalResponse,
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: finalResponse,
                  annotations: [],
                },
              ],
            },
          ],
        });
      }),
    },
  };
}

// =============================================================================
// Mock Google/Gemini Client
// =============================================================================

/**
 * Creates a mock Google GenAI client for Gemini agent tests
 */
export function createMockGeminiClient(
  responseText: string,
  functionCalls?: Array<{ id?: string; name: string; args: unknown }>
) {
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
}

// =============================================================================
// Mock Debate Context
// =============================================================================

/**
 * Creates a mock debate context with sensible defaults
 */
export function createMockContext(overrides?: Partial<DebateContext>): DebateContext {
  return {
    sessionId: 'test-session',
    topic: 'Test topic',
    mode: 'collaborative' as DebateMode,
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
    ...overrides,
  };
}

// =============================================================================
// Mock Agent Config
// =============================================================================

/**
 * Creates a mock agent config with sensible defaults
 */
export function createMockAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    provider: 'anthropic' as AIProvider,
    model: 'test-model',
    temperature: 0.7,
    ...overrides,
  };
}

// =============================================================================
// Mock Agent Response
// =============================================================================

/**
 * Creates a mock agent response with sensible defaults
 */
export function createMockResponse(
  agentId: string,
  overrides?: Partial<AgentResponse>
): AgentResponse {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    position: `Position from ${agentId}`,
    reasoning: `Reasoning from ${agentId}`,
    confidence: 0.8,
    timestamp: new Date(),
    ...overrides,
  };
}

// =============================================================================
// Mock Toolkit
// =============================================================================

/**
 * Creates a mock agent toolkit
 */
export function createMockToolkit(overrides?: {
  tools?: AgentTool[];
  executeTool?: (name: string, input: unknown, agentId?: string) => Promise<unknown>;
  setContext?: (context: DebateContext) => void;
}): AgentToolkit {
  return {
    getTools: () => overrides?.tools ?? [],
    executeTool: overrides?.executeTool ?? vi.fn().mockResolvedValue({}),
    setContext: overrides?.setContext ?? vi.fn(),
    getPendingContextRequests: () => [],
    clearPendingRequests: vi.fn(),
    hasPendingRequests: () => false,
  };
}

/**
 * Creates a mock toolkit with a search_web tool
 */
export function createMockToolkitWithSearch(
  searchResults?: Array<{ title: string; url: string; snippet: string }>
): AgentToolkit {
  return {
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
        results: searchResults ?? [
          { title: 'Search Result', url: 'https://example.com', snippet: 'Test snippet' },
        ],
      },
    }),
    setContext: vi.fn(),
    getPendingContextRequests: () => [],
    clearPendingRequests: vi.fn(),
    hasPendingRequests: () => false,
  };
}

/**
 * Creates a mock toolkit with a perplexity_search tool
 */
export function createMockToolkitWithPerplexitySearch(
  citations?: Array<{ title: string; url: string; snippet: string }>
): AgentToolkit {
  return {
    getTools: () => [
      {
        name: 'perplexity_search',
        description: 'Search with Perplexity',
        parameters: { query: { type: 'string', description: 'Search query' } },
      },
    ],
    executeTool: vi.fn().mockResolvedValue({
      success: true,
      data: {
        answer: 'Mock answer from Perplexity',
        citations: citations ?? [
          { title: 'Citation 1', url: 'https://cite.example.com', snippet: 'Citation snippet' },
        ],
      },
    }),
    setContext: vi.fn(),
    getPendingContextRequests: () => [],
    clearPendingRequests: vi.fn(),
    hasPendingRequests: () => false,
  };
}

/**
 * Creates a mock toolkit with a submit_response tool
 */
export function createMockToolkitWithSubmitResponse(responseData?: {
  position?: string;
  reasoning?: string;
  confidence?: number;
}): AgentToolkit {
  return {
    getTools: () => [
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
        position: responseData?.position ?? 'Submitted position',
        reasoning: responseData?.reasoning ?? 'Submitted reasoning',
        confidence: responseData?.confidence ?? 0.85,
      },
    }),
    setContext: vi.fn(),
    getPendingContextRequests: () => [],
    clearPendingRequests: vi.fn(),
    hasPendingRequests: () => false,
  };
}

/**
 * Creates a mock toolkit that returns an error for tool execution
 */
export function createMockToolkitWithError(errorMessage = 'Tool failed'): AgentToolkit {
  return {
    getTools: () => [
      {
        name: 'failing_tool',
        description: 'A failing tool',
        parameters: { input: { type: 'string', description: 'Input' } },
      },
    ],
    executeTool: vi.fn().mockRejectedValue(new Error(errorMessage)),
    setContext: vi.fn(),
    getPendingContextRequests: () => [],
    clearPendingRequests: vi.fn(),
    hasPendingRequests: () => false,
  };
}

// =============================================================================
// Mock Citations
// =============================================================================

/**
 * Creates mock citations
 */
export function createMockCitations(count = 2): Citation[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Source ${i + 1}`,
    url: `https://example.com/${i + 1}`,
    snippet: `Snippet from source ${i + 1}`,
  }));
}

// =============================================================================
// Mock Tool Call Records
// =============================================================================

/**
 * Creates a mock tool call record
 */
export function createMockToolCallRecord(overrides?: Partial<ToolCallRecord>): ToolCallRecord {
  return {
    toolName: 'search_web',
    input: { query: 'test query' },
    output: { success: true, data: { results: [] } },
    timestamp: new Date(),
    ...overrides,
  };
}

// =============================================================================
// JSON Response Helpers
// =============================================================================

/**
 * Creates a JSON response string for agent responses
 */
export function createJsonResponse(data: {
  position?: string;
  reasoning?: string;
  confidence?: number;
}): string {
  return JSON.stringify({
    position: data.position ?? 'Test position',
    reasoning: data.reasoning ?? 'Test reasoning',
    confidence: data.confidence ?? 0.8,
  });
}

// =============================================================================
// Mock BaseAgent Factory
// =============================================================================

/**
 * Creates a MockAgent instance for testing with registries.
 * Use this instead of ad-hoc mock objects to get proper type safety.
 *
 * @example
 * ```typescript
 * const agent = createMockBaseAgent('test-agent', 'anthropic');
 * registry.registerProvider('anthropic', () => agent, 'test-model');
 * ```
 */
export function createMockBaseAgent(
  id: string,
  provider: AIProvider,
  options?: {
    mockResponse?: Partial<AgentResponse>;
    responseDelay?: number;
    model?: string;
  }
): MockAgent {
  const config: AgentConfig = {
    id,
    name: `Test ${provider}`,
    provider,
    model: options?.model ?? 'test-model',
  };

  const mockResponse: AgentResponse | undefined = options?.mockResponse
    ? {
        agentId: id,
        agentName: `Test ${provider}`,
        position: options.mockResponse.position ?? 'Mock position',
        reasoning: options.mockResponse.reasoning ?? 'Mock reasoning',
        confidence: options.mockResponse.confidence ?? 0.8,
        timestamp: options.mockResponse.timestamp ?? new Date(),
        ...options.mockResponse,
      }
    : undefined;

  return new MockAgent(config, {
    mockResponse,
    responseDelay: options?.responseDelay,
  });
}

/**
 * Creates a factory function that returns a MockAgent, suitable for registry.registerProvider.
 *
 * @example
 * ```typescript
 * registry.registerProvider('anthropic', createMockAgentFactory('anthropic'), 'test-model');
 * ```
 */
export function createMockAgentFactory(
  provider: AIProvider,
  options?: {
    mockResponse?: Partial<AgentResponse>;
    responseDelay?: number;
  }
): (config: AgentConfig, toolkit?: AgentToolkit) => MockAgent {
  return (config: AgentConfig, toolkit?: AgentToolkit) => {
    const agent = new MockAgent(config, {
      mockResponse: options?.mockResponse
        ? {
            agentId: config.id,
            agentName: config.name,
            position: options.mockResponse.position ?? 'Mock position',
            reasoning: options.mockResponse.reasoning ?? 'Mock reasoning',
            confidence: options.mockResponse.confidence ?? 0.8,
            timestamp: options.mockResponse.timestamp ?? new Date(),
            ...options.mockResponse,
          }
        : undefined,
      responseDelay: options?.responseDelay,
    });
    if (toolkit) {
      agent.setToolkit(toolkit);
    }
    return agent;
  };
}
