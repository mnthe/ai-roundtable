/**
 * Perplexity Search Utilities
 *
 * Utilities for Perplexity's built-in web search capabilities
 * with automatic citation extraction from search_results field.
 *
 * Perplexity models have built-in web search and automatically return
 * citations via the search_results field in API responses.
 */

import type { ChatMessageOutput } from '@perplexity-ai/perplexity_ai/resources';
import type { StreamChunk } from '@perplexity-ai/perplexity_ai/resources/chat/chat';
import type { Citation, ToolCallRecord } from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PerplexitySearch');

/**
 * Extract text content from message (handles both string and array content)
 *
 * @param message - Chat message output from API
 * @returns Extracted text content
 */
export function extractContentText(message: ChatMessageOutput | undefined): string {
  if (!message) return '';

  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (chunk): chunk is ChatMessageOutput.ChatMessageContentTextChunk => chunk.type === 'text'
      )
      .map((chunk) => chunk.text)
      .join('');
  }

  return '';
}

/**
 * Extract domain name from URL for use as a readable title
 *
 * @param url - Full URL string
 * @returns Domain name without 'www.' prefix
 * @example "https://www.example.com/path" -> "example.com"
 */
export function extractDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Remove 'www.' prefix for cleaner titles
    return hostname.replace(/^www\./, '');
  } catch {
    // If URL parsing fails, return the original string
    return url;
  }
}

/**
 * Extract citation reference numbers from response text
 * Looks for patterns like [1], [2], [3], etc.
 *
 * @param responseText - Response text containing citation markers
 * @returns Set of referenced citation indices (1-based)
 */
export function extractCitedIndices(responseText: string): Set<number> {
  const citedIndices = new Set<number>();
  // Match citation markers like [1], [2], [1,2], [1][2], [1, 2, 3]
  const markerPattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let match;

  while ((match = markerPattern.exec(responseText)) !== null) {
    // match[1] is guaranteed to exist by the regex pattern
    const captured = match[1];
    if (captured) {
      // Split by comma to handle [1,2,3] format
      const numbers = captured.split(/\s*,\s*/);
      for (const num of numbers) {
        const index = parseInt(num, 10);
        if (!isNaN(index) && index > 0) {
          citedIndices.add(index);
        }
      }
    }
  }

  return citedIndices;
}

/**
 * Extract citations from Perplexity response's native search_results field
 * The official SDK provides search_results directly in the response
 *
 * @param response - Stream chunk response from API
 * @param responseText - Optional response text to filter only cited sources
 * @returns Array of citations extracted from search results
 */
export function extractPerplexityCitations(
  response: StreamChunk,
  responseText?: string
): Citation[] {
  const allCitations: Citation[] = [];

  // Extract citations from native search_results field (preferred)
  // Defensive check: ensure search_results is an array
  if (
    response.search_results &&
    Array.isArray(response.search_results) &&
    response.search_results.length > 0
  ) {
    for (const result of response.search_results) {
      // Skip malformed results without URL
      if (!result || typeof result.url !== 'string') continue;
      allCitations.push({
        title: result.title ?? extractDomainFromUrl(result.url),
        url: result.url,
        snippet: result.date ? `Published: ${result.date}` : result.snippet,
      });
    }
  }
  // Fallback to deprecated citations field (string URLs)
  // Defensive check: ensure citations is an array
  else if (
    response.citations &&
    Array.isArray(response.citations) &&
    response.citations.length > 0
  ) {
    for (const url of response.citations) {
      // Skip non-string citations
      if (typeof url !== 'string') continue;
      allCitations.push({
        title: extractDomainFromUrl(url),
        url: url,
      });
    }
  }

  if (allCitations.length === 0) {
    logger.debug({ responseId: response.id }, 'No citations found in response');
    return [];
  }

  // Filter citations to only those actually referenced in the response text
  if (responseText && allCitations.length > 0) {
    const citedIndices = extractCitedIndices(responseText);
    if (citedIndices.size > 0) {
      // Only include citations that are actually referenced (1-based index)
      return allCitations.filter((_, index) => citedIndices.has(index + 1));
    }
  }

  return allCitations;
}

/**
 * Process Perplexity search results and create tool call record
 *
 * @param citations - Extracted citations
 * @param topic - Debate topic (used as search query input)
 * @returns Tool call record for perplexity_search
 */
export function createSearchToolCall(citations: Citation[], topic: string): ToolCallRecord {
  return {
    toolName: 'perplexity_search',
    input: { query: topic },
    output: {
      success: true,
      data: {
        results: citations.map((c) => ({
          title: c.title,
          url: c.url,
        })),
      },
    },
    timestamp: new Date(),
  };
}
