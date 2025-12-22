/**
 * OpenAI Responses API Utilities Tests
 *
 * Tests for the OpenAI Responses API utilities including web search,
 * citation extraction, and function call handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'openai/resources/responses/responses';
import {
  buildResponsesTools,
  extractCitationsFromResponseOutput,
  extractTextFromResponse,
  recordWebSearchToolCall,
  executeResponsesCompletion,
  executeSimpleResponsesCompletion,
} from '../../../../src/agents/openai/responses.js';
import type {
  ResponsesWebSearchConfig,
  ResponsesCompletionParams,
  SimpleResponsesCompletionParams,
} from '../../../../src/agents/openai/types.js';
import type { Citation } from '../../../../src/types/index.js';

describe('OpenAI Responses API Utilities', () => {
  describe('buildResponsesTools', () => {
    it('should include web search tool by default', () => {
      const tools = buildResponsesTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: 'web_search',
        search_context_size: 'medium',
      });
    });

    it('should include web search with custom context size', () => {
      const config: ResponsesWebSearchConfig = {
        enabled: true,
        searchContextSize: 'high',
      };

      const tools = buildResponsesTools(undefined, config);

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: 'web_search',
        search_context_size: 'high',
      });
    });

    it('should exclude web search when disabled', () => {
      const config: ResponsesWebSearchConfig = {
        enabled: false,
      };

      const tools = buildResponsesTools(undefined, config);

      expect(tools).toHaveLength(0);
    });

    it('should include custom function tools', () => {
      const functionTools = [
        {
          type: 'function' as const,
          name: 'fact_check',
          description: 'Check a fact',
          parameters: { type: 'object' as const, properties: {} },
          strict: false,
        },
      ];

      const tools = buildResponsesTools(functionTools);

      expect(tools).toHaveLength(2);
      expect(tools[0].type).toBe('web_search');
      expect(tools[1].type).toBe('function');
      expect((tools[1] as typeof functionTools[0]).name).toBe('fact_check');
    });

    it('should combine web search and multiple function tools', () => {
      const functionTools = [
        {
          type: 'function' as const,
          name: 'tool1',
          description: 'Tool 1',
          parameters: { type: 'object' as const, properties: {} },
          strict: false,
        },
        {
          type: 'function' as const,
          name: 'tool2',
          description: 'Tool 2',
          parameters: { type: 'object' as const, properties: {} },
          strict: false,
        },
      ];

      const tools = buildResponsesTools(functionTools, { enabled: true, searchContextSize: 'low' });

      expect(tools).toHaveLength(3);
      expect(tools[0].type).toBe('web_search');
      expect((tools[0] as { search_context_size?: string }).search_context_size).toBe('low');
    });

    it('should only include function tools when web search disabled', () => {
      const functionTools = [
        {
          type: 'function' as const,
          name: 'custom_tool',
          description: 'Custom',
          parameters: { type: 'object' as const, properties: {} },
          strict: false,
        },
      ];

      const tools = buildResponsesTools(functionTools, { enabled: false });

      expect(tools).toHaveLength(1);
      expect(tools[0].type).toBe('function');
    });

    it('should handle empty function tools array', () => {
      const tools = buildResponsesTools([]);

      expect(tools).toHaveLength(1);
      expect(tools[0].type).toBe('web_search');
    });
  });

  describe('extractCitationsFromResponseOutput', () => {
    it('should return empty array for empty output', () => {
      const output: Response['output'] = [];

      const citations = extractCitationsFromResponseOutput(output);

      expect(citations).toEqual([]);
    });

    it('should extract URL citations from message items', () => {
      const output: Response['output'] = [
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Some text',
              annotations: [
                {
                  type: 'url_citation',
                  start_index: 0,
                  end_index: 10,
                  url: 'https://example.com/page1',
                  title: 'Example Page 1',
                },
                {
                  type: 'url_citation',
                  start_index: 20,
                  end_index: 30,
                  url: 'https://example.com/page2',
                  title: 'Example Page 2',
                },
              ],
            },
          ],
        },
      ];

      const citations = extractCitationsFromResponseOutput(output);

      expect(citations).toHaveLength(2);
      expect(citations[0]).toEqual({
        title: 'Example Page 1',
        url: 'https://example.com/page1',
        snippet: undefined,
      });
      expect(citations[1]).toEqual({
        title: 'Example Page 2',
        url: 'https://example.com/page2',
        snippet: undefined,
      });
    });

    it('should deduplicate citations by URL', () => {
      const output: Response['output'] = [
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Text',
              annotations: [
                {
                  type: 'url_citation',
                  start_index: 0,
                  end_index: 5,
                  url: 'https://example.com/same',
                  title: 'Same URL First',
                },
                {
                  type: 'url_citation',
                  start_index: 10,
                  end_index: 15,
                  url: 'https://example.com/same',
                  title: 'Same URL Second',
                },
              ],
            },
          ],
        },
      ];

      const citations = extractCitationsFromResponseOutput(output);

      expect(citations).toHaveLength(1);
      expect(citations[0].title).toBe('Same URL First');
    });

    it('should handle missing title with default', () => {
      const output: Response['output'] = [
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Text',
              annotations: [
                {
                  type: 'url_citation',
                  start_index: 0,
                  end_index: 5,
                  url: 'https://example.com/no-title',
                  // title is missing
                } as { type: 'url_citation'; start_index: number; end_index: number; url: string; title?: string },
              ],
            },
          ],
        },
      ];

      const citations = extractCitationsFromResponseOutput(output);

      expect(citations).toHaveLength(1);
      expect(citations[0].title).toBe('Untitled');
    });

    it('should skip non-message items', () => {
      const output: Response['output'] = [
        {
          type: 'web_search_call',
          id: 'web-1',
          status: 'completed',
        },
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Text',
              annotations: [
                {
                  type: 'url_citation',
                  start_index: 0,
                  end_index: 5,
                  url: 'https://example.com',
                  title: 'Example',
                },
              ],
            },
          ],
        },
      ];

      const citations = extractCitationsFromResponseOutput(output);

      expect(citations).toHaveLength(1);
    });

    it('should skip non-text content', () => {
      const output: Response['output'] = [
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'refusal',
              refusal: 'I cannot do that',
            } as { type: 'refusal'; refusal: string },
          ],
        },
      ];

      const citations = extractCitationsFromResponseOutput(output);

      expect(citations).toEqual([]);
    });

    it('should handle content without annotations', () => {
      const output: Response['output'] = [
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Text without annotations',
              // annotations missing
            } as { type: 'output_text'; text: string },
          ],
        },
      ];

      const citations = extractCitationsFromResponseOutput(output);

      expect(citations).toEqual([]);
    });
  });

  describe('extractTextFromResponse', () => {
    it('should extract text using output_text accessor', () => {
      const response = {
        output_text: 'Hello, World!',
      } as Response;

      const text = extractTextFromResponse(response);

      expect(text).toBe('Hello, World!');
    });

    it('should return empty string when output_text is undefined', () => {
      const response = {
        output_text: undefined,
      } as unknown as Response;

      const text = extractTextFromResponse(response);

      expect(text).toBe('');
    });

    it('should return empty string when output_text is null', () => {
      const response = {
        output_text: null,
      } as unknown as Response;

      const text = extractTextFromResponse(response);

      expect(text).toBe('');
    });
  });

  describe('recordWebSearchToolCall', () => {
    it('should return undefined when no web_search_call in output', () => {
      const output: Response['output'] = [
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [],
        },
      ];
      const citations: Citation[] = [];

      const result = recordWebSearchToolCall(output, citations);

      expect(result).toBeUndefined();
    });

    it('should return undefined when no citations', () => {
      const output: Response['output'] = [
        {
          type: 'web_search_call',
          id: 'web-1',
          status: 'completed',
        },
      ];
      const citations: Citation[] = [];

      const result = recordWebSearchToolCall(output, citations);

      expect(result).toBeUndefined();
    });

    it('should record web search tool call when present with citations', () => {
      const output: Response['output'] = [
        {
          type: 'web_search_call',
          id: 'web-1',
          status: 'completed',
        },
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [],
        },
      ];
      const citations: Citation[] = [
        { title: 'Page 1', url: 'https://example.com/1', snippet: undefined },
        { title: 'Page 2', url: 'https://example.com/2', snippet: undefined },
      ];

      const result = recordWebSearchToolCall(output, citations);

      expect(result).toBeDefined();
      expect(result!.toolName).toBe('web_search');
      expect(result!.input).toEqual({ query: 'auto' });
      expect(result!.output).toEqual({
        success: true,
        data: {
          results: [
            { title: 'Page 1', url: 'https://example.com/1' },
            { title: 'Page 2', url: 'https://example.com/2' },
          ],
        },
      });
      expect(result!.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('executeResponsesCompletion', () => {
    let mockClient: { responses: { create: ReturnType<typeof vi.fn> } };

    beforeEach(() => {
      vi.clearAllMocks();
      mockClient = {
        responses: {
          create: vi.fn(),
        },
      };
    });

    it('should execute basic completion without tools', async () => {
      const mockResponse: Partial<Response> = {
        id: 'resp-1',
        output_text: 'Hello, World!',
        output: [
          {
            type: 'message',
            id: 'msg-1',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Hello, World!',
                annotations: [],
              },
            ],
          },
        ],
      };
      mockClient.responses.create.mockResolvedValue(mockResponse);

      const params: ResponsesCompletionParams = {
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'You are a helpful assistant',
        input: 'Hello',
      };

      const result = await executeResponsesCompletion(params);

      expect(result.rawText).toBe('Hello, World!');
      expect(result.toolCalls).toEqual([]);
      expect(result.citations).toEqual([]);
      expect(mockClient.responses.create).toHaveBeenCalledTimes(1);
    });

    it('should include web search tool by default', async () => {
      const mockResponse: Partial<Response> = {
        id: 'resp-1',
        output_text: 'Result',
        output: [],
      };
      mockClient.responses.create.mockResolvedValue(mockResponse);

      await executeResponsesCompletion({
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System',
        input: 'User input',
      });

      expect(mockClient.responses.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ type: 'web_search' }),
          ]),
        })
      );
    });

    it('should disable web search when configured', async () => {
      const mockResponse: Partial<Response> = {
        id: 'resp-1',
        output_text: 'Result',
        output: [],
      };
      mockClient.responses.create.mockResolvedValue(mockResponse);

      await executeResponsesCompletion({
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System',
        input: 'User input',
        webSearch: { enabled: false },
      });

      expect(mockClient.responses.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: undefined,
        })
      );
    });

    it('should extract web search citations', async () => {
      const mockResponse: Partial<Response> = {
        id: 'resp-1',
        output_text: 'Found info',
        output: [
          {
            type: 'web_search_call',
            id: 'web-1',
            status: 'completed',
          },
          {
            type: 'message',
            id: 'msg-1',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Found info',
                annotations: [
                  {
                    type: 'url_citation',
                    start_index: 0,
                    end_index: 5,
                    url: 'https://example.com',
                    title: 'Example',
                  },
                ],
              },
            ],
          },
        ],
      };
      mockClient.responses.create.mockResolvedValue(mockResponse);

      const result = await executeResponsesCompletion({
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System',
        input: 'Search for info',
      });

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].url).toBe('https://example.com');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('web_search');
    });

    it('should handle function calls in loop', async () => {
      const mockInitialResponse: Partial<Response> = {
        id: 'resp-1',
        output_text: '',
        output: [
          {
            type: 'function_call',
            id: 'fc-1',
            status: 'completed',
            name: 'fact_check',
            arguments: '{"claim":"test claim"}',
            call_id: 'call-123',
          } as Response['output'][number],
        ],
      };

      const mockFinalResponse: Partial<Response> = {
        id: 'resp-2',
        output_text: 'Final answer',
        output: [
          {
            type: 'message',
            id: 'msg-1',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Final answer',
                annotations: [],
              },
            ],
          },
        ],
      };

      mockClient.responses.create
        .mockResolvedValueOnce(mockInitialResponse)
        .mockResolvedValueOnce(mockFinalResponse);

      const executeTool = vi.fn().mockResolvedValue({ verified: true });

      const result = await executeResponsesCompletion({
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System',
        input: 'User input',
        webSearch: { enabled: false },
        functionTools: [
          {
            type: 'function',
            name: 'fact_check',
            description: 'Check facts',
            parameters: { type: 'object', properties: {} },
            strict: false,
          },
        ],
        executeTool,
      });

      expect(executeTool).toHaveBeenCalledWith('fact_check', { claim: 'test claim' });
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('fact_check');
      expect(result.toolCalls[0].input).toEqual({ claim: 'test claim' });
      expect(result.rawText).toBe('Final answer');
    });

    it('should extract citations from custom tool results', async () => {
      const mockInitialResponse: Partial<Response> = {
        id: 'resp-1',
        output_text: '',
        output: [
          {
            type: 'function_call',
            id: 'fc-1',
            status: 'completed',
            name: 'search_tool',
            arguments: '{"query":"test"}',
            call_id: 'call-123',
          } as Response['output'][number],
        ],
      };

      const mockFinalResponse: Partial<Response> = {
        id: 'resp-2',
        output_text: 'Answer',
        output: [],
      };

      mockClient.responses.create
        .mockResolvedValueOnce(mockInitialResponse)
        .mockResolvedValueOnce(mockFinalResponse);

      const toolResult = {
        success: true,
        data: { results: [{ title: 'Source', url: 'https://source.com' }] },
      };
      const executeTool = vi.fn().mockResolvedValue(toolResult);
      const extractToolCitations = vi.fn().mockReturnValue([
        { title: 'Source', url: 'https://source.com', snippet: undefined },
      ]);

      const result = await executeResponsesCompletion({
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System',
        input: 'User input',
        webSearch: { enabled: false },
        functionTools: [
          {
            type: 'function',
            name: 'search_tool',
            description: 'Search',
            parameters: { type: 'object', properties: {} },
            strict: false,
          },
        ],
        executeTool,
        extractToolCitations,
      });

      expect(extractToolCitations).toHaveBeenCalledWith('search_tool', toolResult);
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].url).toBe('https://source.com');
    });

    it('should limit function call iterations', async () => {
      // Create response that always returns a function call
      const mockLoopResponse: Partial<Response> = {
        id: 'resp-loop',
        output_text: '',
        output: [
          {
            type: 'function_call',
            id: 'fc-1',
            status: 'completed',
            name: 'infinite_tool',
            arguments: '{}',
            call_id: 'call-loop',
          } as Response['output'][number],
        ],
      };

      mockClient.responses.create.mockResolvedValue(mockLoopResponse);
      const executeTool = vi.fn().mockResolvedValue({ continue: true });

      const result = await executeResponsesCompletion({
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System',
        input: 'User input',
        webSearch: { enabled: false },
        functionTools: [
          {
            type: 'function',
            name: 'infinite_tool',
            description: 'Infinite',
            parameters: { type: 'object', properties: {} },
            strict: false,
          },
        ],
        executeTool,
      });

      // Should stop after MAX_FUNCTION_CALL_ITERATIONS (10)
      // Initial call + 10 iterations = 11 calls
      expect(mockClient.responses.create).toHaveBeenCalledTimes(11);
      expect(result.toolCalls).toHaveLength(10);
    });
  });

  describe('executeSimpleResponsesCompletion', () => {
    let mockClient: { responses: { create: ReturnType<typeof vi.fn> } };

    beforeEach(() => {
      vi.clearAllMocks();
      mockClient = {
        responses: {
          create: vi.fn(),
        },
      };
    });

    it('should execute simple completion and return text', async () => {
      const mockResponse: Partial<Response> = {
        id: 'resp-1',
        output_text: 'Simple response',
        output: [],
      };
      mockClient.responses.create.mockResolvedValue(mockResponse);

      const params: SimpleResponsesCompletionParams = {
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System prompt',
        input: 'User input',
        agentId: 'test-agent',
        convertError: (e) => e instanceof Error ? e : new Error(String(e)),
      };

      const result = await executeSimpleResponsesCompletion(params);

      expect(result).toBe('Simple response');
      expect(mockClient.responses.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          instructions: 'System prompt',
          input: 'User input',
          max_output_tokens: 1000,
          temperature: 0.7,
        })
      );
    });

    it('should not include tools in simple completion', async () => {
      const mockResponse: Partial<Response> = {
        id: 'resp-1',
        output_text: 'Response',
        output: [],
      };
      mockClient.responses.create.mockResolvedValue(mockResponse);

      await executeSimpleResponsesCompletion({
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System',
        input: 'Input',
        agentId: 'test',
        convertError: (e) => e instanceof Error ? e : new Error(String(e)),
      });

      expect(mockClient.responses.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tools: expect.anything(),
        })
      );
    });

    it('should convert and throw errors', async () => {
      const originalError = new Error('API error');
      mockClient.responses.create.mockRejectedValue(originalError);

      const convertedError = new Error('Converted error');
      const convertError = vi.fn().mockReturnValue(convertedError);

      const params: SimpleResponsesCompletionParams = {
        client: mockClient as any,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        instructions: 'System',
        input: 'Input',
        agentId: 'test',
        convertError,
      };

      await expect(executeSimpleResponsesCompletion(params)).rejects.toThrow(convertedError);
      expect(convertError).toHaveBeenCalledWith(originalError);
    });
  });
});
