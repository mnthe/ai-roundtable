/**
 * ChatGPT Agent - OpenAI ChatGPT implementation
 */

import OpenAI from 'openai';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import {
  convertSDKError,
  buildOpenAITools,
  executeOpenAICompletion,
  executeSimpleOpenAICompletion,
} from './utils/index.js';
import type { AgentConfig, DebateContext } from '../types/index.js';

/**
 * Configuration options for ChatGPT Agent
 */
export interface ChatGPTAgentOptions {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Custom OpenAI client instance (for testing) */
  client?: OpenAI;
}

/**
 * ChatGPT Agent using OpenAI's API
 *
 * Supports:
 * - Function calling (tools)
 * - Structured response parsing
 * - Citation tracking from tool calls
 */
export class ChatGPTAgent extends BaseAgent {
  private client: OpenAI;

  constructor(config: AgentConfig, options?: ChatGPTAgentOptions) {
    super(config);

    if (options?.client) {
      this.client = options.client;
    } else {
      this.client = new OpenAI({
        apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY,
      });
    }
  }

  /**
   * Call OpenAI API to generate a response
   *
   * Implements the provider-specific API call for the template method pattern.
   * Uses the shared executeOpenAICompletion utility for common OpenAI SDK patterns.
   */
  protected override async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    return executeOpenAICompletion({
      client: this.client,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      systemPrompt,
      userMessage,
      tools: buildOpenAITools(this.toolkit),
      executeTool: (name, input) => this.executeTool(name, input),
      extractCitations: (toolName, result) => this.extractCitationsFromToolResult(toolName, result),
    });
  }

  /**
   * Convert OpenAI SDK errors to standard error types
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'openai');
  }

  /**
   * Perform synthesis by calling OpenAI API directly with synthesis-specific prompts
   * Uses the shared executeSimpleOpenAICompletion utility.
   */
  protected override async performSynthesis(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    return executeSimpleOpenAICompletion({
      client: this.client,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      systemPrompt,
      userMessage,
      agentId: this.id,
      convertError: (error) => this.convertError(error),
      debugMessage: 'Performing synthesis',
    });
  }

  /**
   * Generate a raw text completion without parsing into structured format
   * Uses the shared executeSimpleOpenAICompletion utility.
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    return executeSimpleOpenAICompletion({
      client: this.client,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      systemPrompt: systemPrompt ?? 'You are a helpful AI assistant. Respond exactly as instructed.',
      userMessage: prompt,
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
        this.client.chat.completions.create({
          model: this.model,
          max_completion_tokens: 10,
          messages: [{ role: 'user', content: 'test' }],
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
