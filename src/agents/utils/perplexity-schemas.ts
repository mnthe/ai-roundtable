/**
 * Zod schemas for Perplexity API response validation
 *
 * Perplexity extends the OpenAI API response with additional fields
 * for citations and search results. These schemas validate those extensions.
 */

import { z } from 'zod';

// ============================================
// Citation Schemas (Deprecated Format)
// ============================================

/**
 * Schema for string citation (just a URL)
 */
const CitationStringSchema = z.string().url();

/**
 * Schema for object citation with url and optional title
 */
const CitationObjectSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
});

/**
 * Schema for a citation item (can be string or object)
 */
const CitationItemSchema = z.union([CitationStringSchema, CitationObjectSchema]);

/**
 * Schema for the deprecated citations array
 */
const CitationsArraySchema = z.array(CitationItemSchema);

// ============================================
// Search Results Schema (New Format 2025+)
// ============================================

/**
 * Schema for a single search result from Perplexity
 */
const SearchResultSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  date: z.string().optional(),
});

/**
 * Schema for the search_results array
 */
const SearchResultsArraySchema = z.array(SearchResultSchema);

// ============================================
// Perplexity Extended Response Schema
// ============================================

/**
 * Schema for Perplexity-specific extended response fields
 *
 * These fields are returned alongside the standard OpenAI API response.
 * The response can have either citations (deprecated) or search_results (new),
 * or neither.
 */
export const PerplexityExtendedResponseSchema = z.object({
  /** Deprecated citations field (array of URLs or citation objects) */
  citations: CitationsArraySchema.optional(),
  /** New search_results field (2025+) */
  search_results: SearchResultsArraySchema.optional(),
});

// ============================================
// Inferred Types
// ============================================

/**
 * Type for a citation item (string URL or object with url/title)
 */
export type PerplexityCitationItem = z.infer<typeof CitationItemSchema>;

/**
 * Type for a search result
 */
export type PerplexitySearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Type for Perplexity extended response fields
 */
export type PerplexityExtendedResponse = z.infer<typeof PerplexityExtendedResponseSchema>;

// ============================================
// Validation Functions
// ============================================

/**
 * Parse Perplexity extended fields from an API response
 *
 * Uses safeParse to gracefully handle responses without Perplexity extensions.
 * Returns undefined if the response doesn't have valid Perplexity fields.
 *
 * @param response - The API response object to parse
 * @returns The parsed Perplexity extensions, or undefined if invalid/missing
 */
export function parsePerplexityExtensions(
  response: unknown
): PerplexityExtendedResponse | undefined {
  const result = PerplexityExtendedResponseSchema.safeParse(response);

  if (!result.success) {
    return undefined;
  }

  // Return undefined if neither field has data (valid but no useful content)
  const data = result.data;
  const hasCitations = data.citations && data.citations.length > 0;
  const hasSearchResults = data.search_results && data.search_results.length > 0;

  if (!hasCitations && !hasSearchResults) {
    return undefined;
  }

  return data;
}

/**
 * Check if a citation item is a string URL
 */
export function isCitationString(
  citation: PerplexityCitationItem
): citation is string {
  return typeof citation === 'string';
}
