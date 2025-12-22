/**
 * Claude Agent - Anthropic Claude implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
  TextBlock,
  ServerToolUseBlock,
  WebSearchToolResultBlock,
  WebSearchResultBlock,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages';
import { createLogger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from '../base.js';
import { convertSDKError } from '../utils/error-converter.js';
import type {
  AgentConfig,
  DebateContext,
  ToolCallRecord,
  Citation,
} from '../../types/index.js';
import type { WebSearchConfig, ClaudeAgentOptions } from './types.js';

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

    // Make the API call with retry logic
    let response = await withRetry(
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

    // Handle tool use loop (both regular tools and server tools like web_search)
    while (response.stop_reason === 'tool_use') {
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

      // Extract citations from web search results
      for (const result of webSearchResults) {
        const webCitations = this.extractCitationsFromWebSearch(result);
        citations.push(...webCitations);

        // Record tool call for web search
        if (Array.isArray(result.content)) {
          toolCalls.push({
            toolName: 'web_search',
            input: {},
            output: {
              success: true,
              data: {
                results: result.content.map((r) => ({
                  title: r.title,
                  url: r.url,
                  pageAge: r.page_age,
                })),
              },
            },
            timestamp: new Date(),
          });
        }
      }

      // Record server tool use for logging purposes
      for (const serverTool of serverToolUseBlocks) {
        logger.debug(
          { agentId: this.id, toolName: serverTool.name },
          'Server tool invoked'
        );
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

    // Check final response for any remaining web search results
    const finalWebSearchResults = response.content.filter(
      (block): block is WebSearchToolResultBlock => block.type === 'web_search_tool_result'
    );
    for (const result of finalWebSearchResults) {
      const webCitations = this.extractCitationsFromWebSearch(result);
      citations.push(...webCitations);

      // Record tool call for web search in final response
      if (Array.isArray(result.content)) {
        toolCalls.push({
          toolName: 'web_search',
          input: {},
          output: {
            success: true,
            data: {
              results: result.content.map((r) => ({
                title: r.title,
                url: r.url,
                pageAge: r.page_age,
              })),
            },
          },
          timestamp: new Date(),
        });
      }
    }

    // Extract text from final response
    const textBlocks = response.content.filter(
      (block): block is TextBlock => block.type === 'text'
    );
    const rawText = textBlocks.map((block) => block.text).join('\n');

    return { rawText, toolCalls, citations };
  }

  /**
   * Convert Anthropic SDK errors to standard error types
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'anthropic');
  }

  /**
   * Perform synthesis by calling Claude API directly with synthesis-specific prompts
   * This bypasses the standard debate prompt building to use synthesis format
   */
  protected override async performSynthesis(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    const response = await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          temperature: this.temperature,
        }),
      { maxRetries: 3 }
    );

    // Extract text from response
    const textBlocks = response.content.filter(
      (block): block is TextBlock => block.type === 'text'
    );
    return textBlocks.map((block) => block.text).join('\n');
  }

  /**
   * Generate a raw text completion without parsing into structured format
   * Used by AIConsensusAnalyzer to get raw JSON responses
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug({ agentId: this.id }, 'Generating raw completion');

    try {
      const response = await withRetry(
        () =>
          this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: systemPrompt ?? 'You are a helpful AI assistant. Respond exactly as instructed.',
            messages: [{ role: 'user', content: prompt }],
            temperature: this.temperature,
          }),
        { maxRetries: 3 }
      );

      // Extract text from response without any parsing
      const textBlocks = response.content.filter(
        (block): block is TextBlock => block.type === 'text'
      );
      return textBlocks.map((block) => block.text).join('\n');
    } catch (error) {
      const convertedError = convertSDKError(error, 'anthropic');
      logger.error(
        { err: convertedError, agentId: this.id },
        'Failed to generate raw completion'
      );
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
      tools.push(...this.buildAnthropicTools());
    }

    // Add native web search if enabled
    if (this.webSearchConfig.enabled) {
      tools.push(this.buildWebSearchTool());
    }

    return tools;
  }

  /**
   * Build Anthropic-format tool definitions from toolkit
   */
  private buildAnthropicTools(): Tool[] {
    if (!this.toolkit) {
      return [];
    }

    return this.toolkit.getTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters,
        required: Object.keys(tool.parameters),
      },
    }));
  }

  /**
   * Build the native web search tool configuration
   */
  private buildWebSearchTool(): ToolUnion {
    return {
      type: 'web_search_20250305',
      name: 'web_search',
      allowed_domains: this.webSearchConfig.allowedDomains ?? null,
      blocked_domains: this.webSearchConfig.blockedDomains ?? null,
      max_uses: this.webSearchConfig.maxUses ?? 5,
    };
  }

  /**
   * Extract citations from web search results
   */
  private extractCitationsFromWebSearch(result: WebSearchToolResultBlock): Citation[] {
    if (!Array.isArray(result.content)) {
      // Error result, no citations
      return [];
    }

    return result.content.map((searchResult: WebSearchResultBlock) => ({
      title: searchResult.title,
      url: searchResult.url,
      snippet: undefined, // encrypted_content is not human-readable
      source: 'web_search',
    }));
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
