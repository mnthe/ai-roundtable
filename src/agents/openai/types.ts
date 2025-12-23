/**
 * OpenAI (ChatGPT) Agent Types
 */

import type OpenAI from 'openai';
import type { FunctionTool } from 'openai/resources/responses/responses';
import type { ToolCallRecord, Citation } from '../../types/index.js';
import type { BaseAgentOptions } from '../types/index.js';

/**
 * Web search configuration for ChatGPT Agent
 */
export interface ChatGPTWebSearchConfig {
  /** Enable web search (default: true) */
  enabled?: boolean;
  /** Context window space for search: 'low' | 'medium' | 'high' (default: 'medium') */
  searchContextSize?: 'low' | 'medium' | 'high';
}

/**
 * Configuration options for ChatGPT Agent
 */
export interface ChatGPTAgentOptions extends BaseAgentOptions<OpenAI> {
  /** Web search configuration (default: enabled) */
  webSearch?: ChatGPTWebSearchConfig;
}

/**
 * Configuration for web search in Responses API
 */
export interface ResponsesWebSearchConfig {
  /** Enable web search (default: true) */
  enabled?: boolean;
  /** Context window space for search: 'low' | 'medium' | 'high' (default: 'medium') */
  searchContextSize?: 'low' | 'medium' | 'high';
}

/**
 * Parameters for Responses API completion
 */
export interface ResponsesCompletionParams {
  /** OpenAI client instance */
  client: OpenAI;
  /** Model to use */
  model: string;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Temperature for sampling */
  temperature: number;
  /** System instructions */
  instructions: string;
  /** User input message */
  input: string;
  /** Optional custom function tools */
  functionTools?: FunctionTool[];
  /** Web search configuration */
  webSearch?: ResponsesWebSearchConfig;
  /** Tool executor function for custom tools */
  executeTool?: (name: string, input: unknown) => Promise<unknown>;
  /** Citation extractor for custom tool results */
  extractToolCitations?: (toolName: string, result: unknown) => Citation[];
}

/**
 * Result from Responses API completion
 */
export interface ResponsesCompletionResult {
  /** Raw text response */
  rawText: string;
  /** Tool calls made during the completion */
  toolCalls: ToolCallRecord[];
  /** Citations extracted from web search and tool results */
  citations: Citation[];
}

/**
 * Parameters for simple Responses API completion (no tools)
 */
export interface SimpleResponsesCompletionParams {
  /** OpenAI client instance */
  client: OpenAI;
  /** Model to use */
  model: string;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Temperature for sampling */
  temperature: number;
  /** System instructions */
  instructions: string;
  /** User input */
  input: string;
  /** Agent ID for logging */
  agentId: string;
  /** Error converter function */
  convertError: (error: unknown) => Error;
  /** Log level for debug message */
  debugMessage?: string;
}
