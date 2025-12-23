/**
 * Anthropic (Claude) Agent Types
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { BaseAgentOptions } from '../types/index.js';

/**
 * Web search configuration options
 */
export interface WebSearchConfig {
  /** Enable native web search (default: true) */
  enabled?: boolean;
  /** Only include results from these domains */
  allowedDomains?: string[];
  /** Exclude results from these domains */
  blockedDomains?: string[];
  /** Maximum number of web searches per request (default: 5) */
  maxUses?: number;
}

/**
 * Configuration options for Claude Agent
 */
export interface ClaudeAgentOptions extends BaseAgentOptions<Anthropic> {
  /** Web search configuration (default: enabled) */
  webSearch?: WebSearchConfig;
}
