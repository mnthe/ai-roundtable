/**
 * Perplexity Agent Types
 */

import type Perplexity from '@perplexity-ai/perplexity_ai';
import type { BaseAgentOptions } from '../types/index.js';

/**
 * Search recency filter options
 */
export type SearchRecencyFilter = 'hour' | 'day' | 'week' | 'month' | 'year';

/**
 * Perplexity search configuration options
 * These options control how Perplexity searches the web
 */
export interface PerplexitySearchOptions {
  /** Filter results by recency */
  recencyFilter?: SearchRecencyFilter;
  /** Limit search to specific domains (max 3) */
  domainFilter?: string[];
}

/**
 * Configuration options for Perplexity Agent
 */
export interface PerplexityAgentOptions extends BaseAgentOptions<Perplexity> {
  /** Search-specific options for Perplexity's web search */
  searchOptions?: PerplexitySearchOptions;
}
