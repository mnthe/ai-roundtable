/**
 * ChatGPT Agent - OpenAI ChatGPT implementation using Responses API
 *
 * Uses the Responses API for native web search capabilities with built-in
 * URL citations, replacing the legacy Chat Completions API.
 *
 * Native Web Search + Function Calling:
 * The Responses API supports both web_search and function tools together.
 * However, to maximize web search usage for evidence gathering:
 * - get_context is NOT passed (context already in prompt, model would skip web search)
 * - fact_check IS passed (complements web search for claim verification)
 */

import OpenAI from 'openai';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from '../base.js';
import { AGENT_DEFAULTS } from '../../config/agent-defaults.js';
import { callWithResilience, convertSDKError } from '../utils/index.js';
import { buildResponsesFunctionTools } from './utils.js';
import { executeResponsesCompletion, executeSimpleResponsesCompletion } from './responses.js';
import type { AgentConfig, DebateContext } from '../../types/index.js';
import type { ChatGPTAgentOptions, ResponsesWebSearchConfig } from './types.js';

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
   *
   * Native Web Search + Function Calling Strategy:
   * - web_search: Always enabled for evidence gathering with auto-citations
   * - get_context: EXCLUDED (context already in prompt; including it causes model
   *   to skip web search, resulting in 0 citations)
   * - fact_check: INCLUDED (complements web search for claim verification)
   * - submit_response: EXCLUDED (validation happens in BaseAgent after parsing)
   */
  protected override async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    // Build function tools, excluding get_context and submit_response
    // get_context is redundant (context in prompt) and causes model to skip web search
    // submit_response is handled by BaseAgent validation
    const functionTools = this.buildSelectiveFunctionTools();

    return executeResponsesCompletion({
      client: this.client,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      instructions: systemPrompt,
      input: userMessage,
      functionTools,
      webSearch: this.webSearchConfig,
      executeTool:
        functionTools.length > 0 ? (name, input) => this.executeTool(name, input) : undefined,
      extractToolCitations:
        functionTools.length > 0
          ? (name, result) => this.extractCitationsFromToolResult(name, result)
          : undefined,
    });
  }

  /**
   * Build function tools for Responses API, excluding tools that interfere with web search
   *
   * Included tools:
   * - fact_check: Complements web search for claim verification
   * - request_context: Request additional context from caller
   *
   * Note: get_context and submit_response were removed as redundant:
   * - Context is already in prompt via buildSystemPrompt()/buildUserMessage()
   * - Response parsing is handled by BaseAgent.extractResponseFromToolCallsOrText()
   */
  private buildSelectiveFunctionTools() {
    return buildResponsesFunctionTools(this.toolkit);
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
      instructions: this.getEffectiveSystemPrompt(systemPrompt),
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
    await callWithResilience('openai', () =>
      this.client.responses.create({
        model: this.model,
        max_output_tokens: 16,
        input: 'test',
      })
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
