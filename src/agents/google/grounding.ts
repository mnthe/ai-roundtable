/**
 * Google Search Grounding Utilities
 *
 * Utilities for Google Search grounding which provides web search capabilities
 * with automatic citation extraction via grounding metadata.
 *
 * Note: Google's Standard API does NOT support combining Google Search grounding
 * with function calling in the same request. This is handled by the GeminiAgent
 * using a Two-Phase approach.
 */

import type { GroundingMetadata, GroundingChunk } from '@google/genai';
import type { Citation, ToolCallRecord } from '../../types/index.js';

/**
 * Extract citations from Google Search grounding metadata
 *
 * Processes GroundingMetadata to extract citations from grounding chunks.
 *
 * @param metadata - Grounding metadata from API response
 * @returns Array of citations extracted from grounding chunks
 */
export function extractCitationsFromGrounding(metadata: GroundingMetadata): Citation[] {
  const chunks = metadata.groundingChunks ?? [];

  return chunks
    .filter((chunk: GroundingChunk) => chunk.web?.uri)
    .map((chunk: GroundingChunk) => ({
      title: chunk.web?.title ?? 'Untitled',
      url: chunk.web?.uri ?? '',
      snippet: undefined,
    }));
}

/**
 * Process grounding metadata and extract citations and tool call records
 *
 * @param metadata - Grounding metadata from API response
 * @returns Object containing citations and tool call records
 */
export function processGroundingMetadata(metadata: GroundingMetadata | undefined): {
  citations: Citation[];
  toolCalls: ToolCallRecord[];
} {
  if (!metadata) {
    return { citations: [], toolCalls: [] };
  }

  const citations = extractCitationsFromGrounding(metadata);
  const toolCalls: ToolCallRecord[] = [];

  // Record tool call for Google Search grounding
  if (metadata.groundingChunks && metadata.groundingChunks.length > 0) {
    toolCalls.push({
      toolName: 'google_search',
      input: { queries: metadata.webSearchQueries ?? [] },
      output: {
        success: true,
        data: {
          results: metadata.groundingChunks.map((chunk) => ({
            title: chunk.web?.title,
            url: chunk.web?.uri,
          })),
        },
      },
      timestamp: new Date(),
    });
  }

  return { citations, toolCalls };
}

/**
 * Build Phase 2 message with Phase 1 search results included
 *
 * This ensures the model has access to web search results even though
 * Google Search grounding is not available in the function calling phase.
 *
 * @param originalMessage - Original user message
 * @param phase1Response - Response text from Phase 1 (with web search)
 * @param citations - Citations extracted from Phase 1
 * @returns Enhanced message for Phase 2
 */
export function buildPhase2Message(
  originalMessage: string,
  phase1Response: string,
  citations: Citation[]
): string {
  if (!phase1Response && citations.length === 0) {
    return originalMessage;
  }

  const searchResultsSummary =
    citations.length > 0
      ? `\n\nWeb Search Results (from Phase 1):\n${citations
          .map((c, i) => `[${i + 1}] ${c.title}: ${c.url}`)
          .join('\n')}`
      : '';

  const previousAnalysis = phase1Response
    ? `\n\nPrevious Analysis (with web search):\n${phase1Response}`
    : '';

  return `${originalMessage}${searchResultsSummary}${previousAnalysis}

Please provide your final response. You have access to additional tools (request_context, fact_check) if you need to verify any claims or get more context.`;
}
