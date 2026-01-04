/**
 * Claude Agent - Anthropic Claude implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ToolUseBlock,
  ServerToolUseBlock,
  WebSearchToolResultBlock,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages';
import { createLogger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import { withRateLimit } from '../../utils/rate-limiter.js';
import { AGENT_DEFAULTS } from '../../config/agent-defaults.js';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from '../base.js';
import { convertSDKError } from '../utils/error-converter.js';
import type { AgentConfig, DebateContext, ToolCallRecord, Citation } from '../../types/index.js';
import type { WebSearchConfig, ClaudeAgentOptions } from './types.js';
import { buildAnthropicTools } from './utils.js';
import {
  buildWebSearchTool,
  extractTextFromResponse,
  processWebSearchResults,
} from './web-search.js';

const logger = createLogger('ClaudeAgent');

/**
 * Claude Agent using Anthropic's API
 *
 * Supports:
 * - Tool use (function calling)
 * - Structured response parsing
 * - Citation tracking from tool calls
 */
export class ClaudeAgent extends BaseAgent {
  private client: Anthropic;
  private webSearchConfig: WebSearchConfig;

  constructor(config: AgentConfig, options?: ClaudeAgentOptions) {
    super(config);

    if (options?.client) {
      this.client = options.client;
    } else {
      this.client = new Anthropic({
        apiKey: options?.apiKey ?? process.env.ANTHROPIC_API_KEY,
      });
    }

    // Web search enabled by default
    this.webSearchConfig = {
      enabled: options?.webSearch?.enabled !== false,
      allowedDomains: options?.webSearch?.allowedDomains,
      blockedDomains: options?.webSearch?.blockedDomains,
      maxUses: options?.webSearch?.maxUses ?? 5,
    };
  }

  /**
   * Call Claude API to generate a response
   *
   * Implements the provider-specific API call for the template method pattern.
   * Supports both toolkit tools and native web search.
   */
  protected override async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    const messages: MessageParam[] = [{ role: 'user', content: userMessage }];

    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // Build tools: toolkit tools + native web search
    const tools = this.buildAllTools();

    let response = await withRetry(
      () =>
        withRateLimit('anthropic', () =>
          this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: systemPrompt,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            temperature: this.temperature,
          })
        ),
      { maxRetries: 3 }
    );

    // Handle tool use loop (both regular tools and server tools like web_search)
    let toolIterationCount = 0;
    while (
      response.stop_reason === 'tool_use' &&
      toolIterationCount < AGENT_DEFAULTS.MAX_TOOL_ITERATIONS
    ) {
      toolIterationCount++;
      // Handle regular toolkit tools
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      );

      // Handle server-side tools (web_search)
      const serverToolUseBlocks = response.content.filter(
        (block): block is ServerToolUseBlock => block.type === 'server_tool_use'
      );

      // Handle web search results that may already be in the response
      const webSearchResults = response.content.filter(
        (block): block is WebSearchToolResultBlock => block.type === 'web_search_tool_result'
      );

      // Extract citations and tool calls from web search results
      const webSearchData = processWebSearchResults(webSearchResults);
      citations.push(...webSearchData.citations);
      toolCalls.push(...webSearchData.toolCalls);

      // Record server tool use for logging purposes
      for (const serverTool of serverToolUseBlocks) {
        logger.debug({ agentId: this.id, toolName: serverTool.name }, 'Server tool invoked');
      }

      const toolResults: MessageParam['content'] = [];

      // Execute regular toolkit tools
      for (const toolUse of toolUseBlocks) {
        const result = await this.executeTool(toolUse.name, toolUse.input);

        toolCalls.push({
          toolName: toolUse.name,
          input: toolUse.input,
          output: result,
          timestamp: new Date(),
        });

        // Extract citations from toolkit tool results
        const extractedCitations = this.extractCitationsFromToolResult(toolUse.name, result);
        citations.push(...extractedCitations);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Continue the conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }

      response = await withRetry(
        () =>
          this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: systemPrompt,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            temperature: this.temperature,
          }),
        { maxRetries: 3 }
      );
    }

    // Warn if tool iteration limit was reached
    if (toolIterationCount >= AGENT_DEFAULTS.MAX_TOOL_ITERATIONS) {
      logger.warn(
        {
          agentId: this.id,
          iterations: toolIterationCount,
          limit: AGENT_DEFAULTS.MAX_TOOL_ITERATIONS,
        },
        'Tool call iteration limit reached'
      );
    }

    // Check final response for any remaining web search results
    const finalWebSearchResults = response.content.filter(
      (block): block is WebSearchToolResultBlock => block.type === 'web_search_tool_result'
    );
    const finalWebSearchData = processWebSearchResults(finalWebSearchResults);
    citations.push(...finalWebSearchData.citations);
    toolCalls.push(...finalWebSearchData.toolCalls);

    // Extract text from final response
    const rawText = extractTextFromResponse(response);

    return { rawText, toolCalls, citations };
  }

  /**
   * Convert Anthropic SDK errors to standard error types
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'anthropic');
  }

  /**
   * Generate a raw text completion without parsing into structured format
   * Used by AIConsensusAnalyzer and synthesis features
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    const effectiveSystemPrompt = this.getEffectiveSystemPrompt(systemPrompt);

    logger.debug({ agentId: this.id }, 'Generating raw completion');

    try {
      const response = await withRetry(
        () =>
          this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: effectiveSystemPrompt,
            messages: [{ role: 'user', content: prompt }],
            temperature: this.temperature,
          }),
        { maxRetries: 3 }
      );

      return extractTextFromResponse(response);
    } catch (error) {
      const convertedError = this.convertError(error);
      logger.error({ err: convertedError, agentId: this.id }, 'Failed to generate raw completion');
      throw convertedError;
    }
  }

  /**
   * Perform minimal API call to verify connectivity
   */
  protected override async performHealthCheck(): Promise<void> {
    await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }],
        }),
      { maxRetries: 3 }
    );
  }

  /**
   * Build all tools: toolkit tools + native web search
   */
  private buildAllTools(): ToolUnion[] {
    const tools: ToolUnion[] = [];

    // Add toolkit tools
    if (this.toolkit) {
      tools.push(...buildAnthropicTools(this.toolkit));
    }

    // Add native web search if enabled
    if (this.webSearchConfig.enabled) {
      tools.push(buildWebSearchTool(this.webSearchConfig));
    }

    return tools;
  }
}

/**
 * Factory function for creating Claude agents
 */
export function createClaudeAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: ClaudeAgentOptions
): ClaudeAgent {
  const agent = new ClaudeAgent(config, options);
  if (toolkit) {
    agent.setToolkit(toolkit);
  }
  return agent;
}
