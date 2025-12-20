/**
 * Claude Agent - Anthropic Claude implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { createLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { BaseAgent, type AgentToolkit } from './base.js';
import { convertSDKError } from './utils/error-converter.js';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  ToolCallRecord,
  Citation,
} from '../types/index.js';

const logger = createLogger('ClaudeAgent');

/**
 * Configuration options for Claude Agent
 */
export interface ClaudeAgentOptions {
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Custom Anthropic client instance (for testing) */
  client?: Anthropic;
}

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

  constructor(config: AgentConfig, options?: ClaudeAgentOptions) {
    super(config);

    if (options?.client) {
      this.client = options.client;
    } else {
      this.client = new Anthropic({
        apiKey: options?.apiKey ?? process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Generate a response using Claude API
   */
  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    const startTime = Date.now();
    logger.info(
      {
        sessionId: context.sessionId,
        agentId: this.id,
        agentName: this.name,
        round: context.currentRound,
        topic: context.topic,
      },
      'Starting agent response generation'
    );

    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const userMessage = this.buildUserMessage(context);

      const messages: MessageParam[] = [
        { role: 'user', content: userMessage },
      ];

      const toolCalls: ToolCallRecord[] = [];
      const citations: Citation[] = [];

      // Build tools if toolkit is available
      const tools = this.toolkit ? this.buildAnthropicTools() : undefined;

      // Make the API call with retry logic
      let response = await withRetry(
        () =>
          this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: systemPrompt,
            messages,
            tools,
            temperature: this.temperature,
          }),
        { maxRetries: 3 }
      );

    // Handle tool use loop
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: MessageParam['content'] = [];

      for (const toolUse of toolUseBlocks) {
        const result = await this.executeTool(toolUse.name, toolUse.input);

        toolCalls.push({
          toolName: toolUse.name,
          input: toolUse.input,
          output: result,
          timestamp: new Date(),
        });

        // Extract citations from search results
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
      messages.push({ role: 'user', content: toolResults });

      response = await withRetry(
        () =>
          this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            system: systemPrompt,
            messages,
            tools,
            temperature: this.temperature,
          }),
        { maxRetries: 3 }
      );
    }

    // Extract text from final response
    const textBlocks = response.content.filter(
      (block): block is TextBlock => block.type === 'text'
    );
    const rawText = textBlocks.map((block) => block.text).join('\n');

      // Extract response from tool calls or text
      const parsed = this.extractResponseFromToolCallsOrText(toolCalls, rawText, context);

      // Build the final response
      const result = this.buildAgentResponse({
        parsed,
        rawText,
        citations,
        toolCalls,
      });

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          sessionId: context.sessionId,
          agentId: this.id,
          agentName: this.name,
          round: context.currentRound,
          durationMs,
          confidence: parsed.confidence,
          toolCallCount: toolCalls.length,
          citationCount: citations.length,
        },
        'Agent response generation completed'
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const convertedError = convertSDKError(error, 'anthropic');
      logger.error(
        {
          err: convertedError,
          sessionId: context.sessionId,
          agentId: this.id,
          agentName: this.name,
          round: context.currentRound,
          durationMs,
        },
        'Failed to generate agent response'
      );
      throw convertedError;
    }
  }

  /**
   * Generate synthesis by calling Claude API directly with synthesis-specific prompts
   * This bypasses the standard debate prompt building to use synthesis format
   */
  protected override async generateSynthesisInternal(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    logger.info({ agentId: this.id, agentName: this.name }, 'Starting synthesis generation');

    try {
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
      const rawText = textBlocks.map((block) => block.text).join('\n');

      logger.info({ agentId: this.id, agentName: this.name }, 'Synthesis generation completed');
      return rawText;
    } catch (error) {
      const convertedError = convertSDKError(error, 'anthropic');
      logger.error(
        { err: convertedError, agentId: this.id, agentName: this.name },
        'Failed to generate synthesis'
      );
      throw convertedError;
    }
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
      throw convertSDKError(error, 'anthropic');
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
