/**
 * Anthropic Web Search Utilities
 *
 * Utilities for the Claude web_search tool which provides native web search
 * capabilities with automatic citation extraction.
 */

import type {
  TextBlock,
  WebSearchToolResultBlock,
  WebSearchResultBlock,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages';
import type Anthropic from '@anthropic-ai/sdk';
import type { Citation, ToolCallRecord } from '../../types/index.js';
import type { WebSearchConfig } from './types.js';

/**
 * Build the native web search tool configuration
 *
 * @param config - Web search configuration options
 * @returns Anthropic tool definition for web_search
 */
export function buildWebSearchTool(config: WebSearchConfig): ToolUnion {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    allowed_domains: config.allowedDomains ?? null,
    blocked_domains: config.blockedDomains ?? null,
    max_uses: config.maxUses ?? 5,
  };
}

/**
 * Extract citations from web search results
 *
 * Processes WebSearchToolResultBlock to extract citations from search results.
 *
 * @param result - Web search tool result block from API response
 * @returns Array of citations extracted from search results
 */
export function extractCitationsFromWebSearch(result: WebSearchToolResultBlock): Citation[] {
  if (!Array.isArray(result.content)) {
    // Error result, no citations
    return [];
  }

  return result.content.map((searchResult: WebSearchResultBlock) => ({
    title: searchResult.title,
    url: searchResult.url,
    snippet: undefined, // encrypted_content is not human-readable
    source: 'web_search',
  }));
}

/**
 * Extract text content from Anthropic message response
 *
 * Filters for text blocks and concatenates their content.
 *
 * @param response - Anthropic API message response
 * @returns Concatenated text content
 */
export function extractTextFromResponse(response: Anthropic.Message): string {
  const textBlocks = response.content.filter((block): block is TextBlock => block.type === 'text');
  return textBlocks.map((block) => block.text).join('\n');
}

/**
 * Process web search results and extract citations and tool call records
 *
 * @param webSearchResults - Array of web search result blocks
 * @returns Object containing citations and tool call records
 */
export function processWebSearchResults(webSearchResults: WebSearchToolResultBlock[]): {
  citations: Citation[];
  toolCalls: ToolCallRecord[];
} {
  const citations: Citation[] = [];
  const toolCalls: ToolCallRecord[] = [];

  for (const result of webSearchResults) {
    const webCitations = extractCitationsFromWebSearch(result);
    citations.push(...webCitations);

    // Record tool call for web search
    if (Array.isArray(result.content)) {
      toolCalls.push({
        toolName: 'web_search',
        input: {},
        output: {
          success: true,
          data: {
            results: result.content.map((r) => ({
              title: r.title,
              url: r.url,
              pageAge: r.page_age,
            })),
          },
        },
        timestamp: new Date(),
      });
    }
  }

  return { citations, toolCalls };
}
