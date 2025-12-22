/**
 * ChatGPT Agent - OpenAI ChatGPT implementation using Responses API
 *
 * Uses the Responses API for native web search capabilities with built-in
 * URL citations, replacing the legacy Chat Completions API.
 */

import OpenAI from 'openai';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import {
  convertSDKError,
  buildResponsesFunctionTools,
  executeResponsesCompletion,
  executeSimpleResponsesCompletion,
  type ResponsesWebSearchConfig,
} from './utils/index.js';
import type { AgentConfig, DebateContext } from '../types/index.js';

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
export interface ChatGPTAgentOptions {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Custom OpenAI client instance (for testing) */
  client?: OpenAI;
  /** Web search configuration (default: enabled) */
  webSearch?: ChatGPTWebSearchConfig;
}

/**
 * ChatGPT Agent using OpenAI's Responses API
 *
 * Supports:
 * - Native web search with automatic citations
 * - Function calling (tools)
 * - Structured response parsing
 * - Citation tracking from web search and tool calls
 */
export class ChatGPTAgent extends BaseAgent {
  private client: OpenAI;
  private webSearchConfig: ResponsesWebSearchConfig;

  constructor(config: AgentConfig, options?: ChatGPTAgentOptions) {
    super(config);

    if (options?.client) {
      this.client = options.client;
    } else {
      this.client = new OpenAI({
        apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY,
      });
    }

    // Web search enabled by default
    this.webSearchConfig = {
      enabled: options?.webSearch?.enabled !== false,
      searchContextSize: options?.webSearch?.searchContextSize ?? 'medium',
    };
  }

  /**
   * Call OpenAI Responses API to generate a response
   *
   * Implements the provider-specific API call for the template method pattern.
   * Uses the Responses API for native web search with automatic citations.
   */
  protected override async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    return executeResponsesCompletion({
      client: this.client,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      instructions: systemPrompt,
      input: userMessage,
      functionTools: buildResponsesFunctionTools(this.toolkit),
      webSearch: this.webSearchConfig,
      executeTool: (name, input) => this.executeTool(name, input),
      extractToolCitations: (toolName, result) => this.extractCitationsFromToolResult(toolName, result),
    });
  }

  /**
   * Convert OpenAI SDK errors to standard error types
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'openai');
  }

  /**
   * Perform synthesis by calling OpenAI Responses API directly with synthesis-specific prompts
   * Uses the Responses API without web search for synthesis.
   */
  protected override async performSynthesis(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    return executeSimpleResponsesCompletion({
      client: this.client,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      instructions: systemPrompt,
      input: userMessage,
      agentId: this.id,
      convertError: (error) => this.convertError(error),
      debugMessage: 'Performing synthesis',
    });
  }

  /**
   * Generate a raw text completion without parsing into structured format
   * Uses the Responses API without web search.
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    return executeSimpleResponsesCompletion({
      client: this.client,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      instructions: systemPrompt ?? 'You are a helpful AI assistant. Respond exactly as instructed.',
      input: prompt,
      agentId: this.id,
      convertError: (error) => this.convertError(error),
      debugMessage: 'Generating raw completion',
    });
  }

  /**
   * Perform minimal API call to verify connectivity
   */
  protected override async performHealthCheck(): Promise<void> {
    await withRetry(
      () =>
        this.client.responses.create({
          model: this.model,
          max_output_tokens: 10,
          input: 'test',
        }),
      { maxRetries: 3 }
    );
  }
}

/**
 * Factory function for creating ChatGPT agents
 */
export function createChatGPTAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: ChatGPTAgentOptions
): ChatGPTAgent {
  const agent = new ChatGPTAgent(config, options);
  if (toolkit) {
    agent.setToolkit(toolkit);
  }
  return agent;
}
