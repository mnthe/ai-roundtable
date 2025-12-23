/**
 * Tests for Anthropic web search utilities
 */

import { describe, it, expect } from 'vitest';
import {
  buildWebSearchTool,
  extractCitationsFromWebSearch,
  extractTextFromResponse,
  processWebSearchResults,
} from '../../../../src/agents/anthropic/web-search.js';
import type {
  WebSearchToolResultBlock,
  WebSearchResultBlock,
} from '@anthropic-ai/sdk/resources/messages';
import type Anthropic from '@anthropic-ai/sdk';
import type { WebSearchConfig } from '../../../../src/agents/anthropic/types.js';

describe('buildWebSearchTool', () => {
  it('should build web search tool with default config', () => {
    const config: WebSearchConfig = {};

    const result = buildWebSearchTool(config);

    expect(result).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      allowed_domains: null,
      blocked_domains: null,
      max_uses: 5,
    });
  });

  it('should build web search tool with allowed domains', () => {
    const config: WebSearchConfig = {
      allowedDomains: ['example.com', 'docs.example.com'],
    };

    const result = buildWebSearchTool(config);

    expect(result.allowed_domains).toEqual(['example.com', 'docs.example.com']);
    expect(result.blocked_domains).toBeNull();
  });

  it('should build web search tool with blocked domains', () => {
    const config: WebSearchConfig = {
      blockedDomains: ['spam.com', 'ads.example.com'],
    };

    const result = buildWebSearchTool(config);

    expect(result.allowed_domains).toBeNull();
    expect(result.blocked_domains).toEqual(['spam.com', 'ads.example.com']);
  });

  it('should build web search tool with custom max uses', () => {
    const config: WebSearchConfig = {
      maxUses: 10,
    };

    const result = buildWebSearchTool(config);

    expect(result.max_uses).toBe(10);
  });

  it('should build web search tool with all options', () => {
    const config: WebSearchConfig = {
      allowedDomains: ['trusted.com'],
      blockedDomains: ['blocked.com'],
      maxUses: 3,
    };

    const result = buildWebSearchTool(config);

    expect(result).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      allowed_domains: ['trusted.com'],
      blocked_domains: ['blocked.com'],
      max_uses: 3,
    });
  });
});

describe('extractCitationsFromWebSearch', () => {
  it('should extract citations from web search results', () => {
    const searchResultBlock: WebSearchToolResultBlock = {
      type: 'web_search_tool_result',
      tool_use_id: 'tool-123',
      content: [
        {
          type: 'web_search_result',
          title: 'Example Article',
          url: 'https://example.com/article',
          encrypted_content: 'encrypted...',
          page_age: '2024-01-15',
        } as WebSearchResultBlock,
        {
          type: 'web_search_result',
          title: 'Another Article',
          url: 'https://another.com/page',
          encrypted_content: 'encrypted...',
          page_age: '2024-02-20',
        } as WebSearchResultBlock,
      ],
    };

    const citations = extractCitationsFromWebSearch(searchResultBlock);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      title: 'Example Article',
      url: 'https://example.com/article',
      snippet: undefined,
      source: 'web_search',
    });
    expect(citations[1]).toEqual({
      title: 'Another Article',
      url: 'https://another.com/page',
      snippet: undefined,
      source: 'web_search',
    });
  });

  it('should return empty array for error result', () => {
    // Error result has string content instead of array
    const errorResult = {
      type: 'web_search_tool_result',
      tool_use_id: 'tool-123',
      content: 'Error: Search failed',
    } as unknown as WebSearchToolResultBlock;

    const citations = extractCitationsFromWebSearch(errorResult);

    expect(citations).toEqual([]);
  });

  it('should handle empty search results', () => {
    const emptyResult: WebSearchToolResultBlock = {
      type: 'web_search_tool_result',
      tool_use_id: 'tool-123',
      content: [],
    };

    const citations = extractCitationsFromWebSearch(emptyResult);

    expect(citations).toEqual([]);
  });

  it('should not include snippet since encrypted_content is not readable', () => {
    const searchResultBlock: WebSearchToolResultBlock = {
      type: 'web_search_tool_result',
      tool_use_id: 'tool-123',
      content: [
        {
          type: 'web_search_result',
          title: 'Test',
          url: 'https://test.com',
          encrypted_content: 'base64_encrypted_content_here',
          page_age: '2024-01-01',
        } as WebSearchResultBlock,
      ],
    };

    const citations = extractCitationsFromWebSearch(searchResultBlock);

    expect(citations[0]?.snippet).toBeUndefined();
  });
});

describe('extractTextFromResponse', () => {
  it('should extract text from single text block', () => {
    const response = {
      content: [{ type: 'text', text: 'Hello, world!' }],
    } as Anthropic.Message;

    const text = extractTextFromResponse(response);

    expect(text).toBe('Hello, world!');
  });

  it('should concatenate multiple text blocks with newlines', () => {
    const response = {
      content: [
        { type: 'text', text: 'First paragraph.' },
        { type: 'text', text: 'Second paragraph.' },
      ],
    } as Anthropic.Message;

    const text = extractTextFromResponse(response);

    expect(text).toBe('First paragraph.\nSecond paragraph.');
  });

  it('should filter out non-text blocks', () => {
    const response = {
      content: [
        { type: 'text', text: 'Text content' },
        { type: 'tool_use', id: 'tool-1', name: 'web_search', input: {} },
        { type: 'text', text: 'More text' },
      ],
    } as unknown as Anthropic.Message;

    const text = extractTextFromResponse(response);

    expect(text).toBe('Text content\nMore text');
  });

  it('should return empty string when no text blocks', () => {
    const response = {
      content: [{ type: 'tool_use', id: 'tool-1', name: 'web_search', input: {} }],
    } as unknown as Anthropic.Message;

    const text = extractTextFromResponse(response);

    expect(text).toBe('');
  });

  it('should handle empty content array', () => {
    const response = {
      content: [],
    } as unknown as Anthropic.Message;

    const text = extractTextFromResponse(response);

    expect(text).toBe('');
  });
});

describe('processWebSearchResults', () => {
  it('should process multiple web search results', () => {
    const webSearchResults: WebSearchToolResultBlock[] = [
      {
        type: 'web_search_tool_result',
        tool_use_id: 'tool-1',
        content: [
          {
            type: 'web_search_result',
            title: 'Result 1',
            url: 'https://example.com/1',
            encrypted_content: 'encrypted...',
            page_age: '2024-01-01',
          } as WebSearchResultBlock,
        ],
      },
      {
        type: 'web_search_tool_result',
        tool_use_id: 'tool-2',
        content: [
          {
            type: 'web_search_result',
            title: 'Result 2',
            url: 'https://example.com/2',
            encrypted_content: 'encrypted...',
            page_age: '2024-02-01',
          } as WebSearchResultBlock,
        ],
      },
    ];

    const { citations, toolCalls } = processWebSearchResults(webSearchResults);

    expect(citations).toHaveLength(2);
    expect(citations[0]?.url).toBe('https://example.com/1');
    expect(citations[1]?.url).toBe('https://example.com/2');

    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]?.toolName).toBe('web_search');
    expect(toolCalls[1]?.toolName).toBe('web_search');
  });

  it('should create tool call record with search results data', () => {
    const webSearchResults: WebSearchToolResultBlock[] = [
      {
        type: 'web_search_tool_result',
        tool_use_id: 'tool-1',
        content: [
          {
            type: 'web_search_result',
            title: 'Test Article',
            url: 'https://test.com/article',
            encrypted_content: 'encrypted...',
            page_age: '2024-03-15',
          } as WebSearchResultBlock,
        ],
      },
    ];

    const { toolCalls } = processWebSearchResults(webSearchResults);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.toolName).toBe('web_search');
    expect(toolCalls[0]?.input).toEqual({});
    expect(toolCalls[0]?.output).toEqual({
      success: true,
      data: {
        results: [
          {
            title: 'Test Article',
            url: 'https://test.com/article',
            pageAge: '2024-03-15',
          },
        ],
      },
    });
    expect(toolCalls[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('should handle empty results array', () => {
    const { citations, toolCalls } = processWebSearchResults([]);

    expect(citations).toEqual([]);
    expect(toolCalls).toEqual([]);
  });

  it('should skip error results when creating tool calls', () => {
    const webSearchResults = [
      {
        type: 'web_search_tool_result',
        tool_use_id: 'tool-1',
        content: 'Error: Search failed',
      } as unknown as WebSearchToolResultBlock,
    ];

    const { citations, toolCalls } = processWebSearchResults(webSearchResults);

    expect(citations).toEqual([]);
    expect(toolCalls).toEqual([]); // No tool call created for error result
  });

  it('should handle mixed success and error results', () => {
    const webSearchResults = [
      {
        type: 'web_search_tool_result',
        tool_use_id: 'tool-1',
        content: [
          {
            type: 'web_search_result',
            title: 'Success',
            url: 'https://success.com',
            encrypted_content: 'encrypted...',
            page_age: '2024-01-01',
          } as WebSearchResultBlock,
        ],
      },
      {
        type: 'web_search_tool_result',
        tool_use_id: 'tool-2',
        content: 'Error: Rate limited',
      } as unknown as WebSearchToolResultBlock,
    ];

    const { citations, toolCalls } = processWebSearchResults(webSearchResults);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.title).toBe('Success');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.output.success).toBe(true);
  });

  it('should extract multiple results from single search', () => {
    const webSearchResults: WebSearchToolResultBlock[] = [
      {
        type: 'web_search_tool_result',
        tool_use_id: 'tool-1',
        content: [
          {
            type: 'web_search_result',
            title: 'First',
            url: 'https://first.com',
            encrypted_content: 'encrypted...',
            page_age: '2024-01-01',
          } as WebSearchResultBlock,
          {
            type: 'web_search_result',
            title: 'Second',
            url: 'https://second.com',
            encrypted_content: 'encrypted...',
            page_age: '2024-01-02',
          } as WebSearchResultBlock,
          {
            type: 'web_search_result',
            title: 'Third',
            url: 'https://third.com',
            encrypted_content: 'encrypted...',
            page_age: '2024-01-03',
          } as WebSearchResultBlock,
        ],
      },
    ];

    const { citations, toolCalls } = processWebSearchResults(webSearchResults);

    expect(citations).toHaveLength(3);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.output.data.results).toHaveLength(3);
  });
});
