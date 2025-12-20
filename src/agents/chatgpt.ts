/**
 * ChatGPT Agent - OpenAI ChatGPT implementation
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';
import { convertSDKError, buildOpenAITools } from './utils/index.js';
import type { AgentConfig, DebateContext, ToolCallRecord, Citation } from '../types/index.js';

const logger = createLogger('ChatGPTAgent');

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
   */
  protected override async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // Build tools if toolkit is available
    const tools = buildOpenAITools(this.toolkit);

    // Make the API call with retry logic
    let response = await withRetry(
      () =>
        this.client.chat.completions.create({
          model: this.model,
          max_completion_tokens: this.maxTokens,
          messages,
          tools,
          temperature: this.temperature,
        }),
      { maxRetries: 3 }
    );

    let choice = response.choices[0];

    // Handle tool call loop
    while (choice?.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      const assistantMessage = choice.message;
      const currentToolCalls = choice.message.tool_calls;
      messages.push(assistantMessage);

      for (const toolCall of currentToolCalls ?? []) {
        // Skip non-function tool calls (e.g., custom tool calls in v6+)
        if (toolCall.type !== 'function') continue;

        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        const result = await this.executeTool(functionName, functionArgs);

        toolCalls.push({
          toolName: functionName,
          input: functionArgs,
          output: result,
          timestamp: new Date(),
        });

        // Extract citations from search results
        const extractedCitations = this.extractCitationsFromToolResult(functionName, result);
        citations.push(...extractedCitations);

        const toolResultMessage: ChatCompletionToolMessageParam = {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        };
        messages.push(toolResultMessage);
      }

      // Continue the conversation with tool results
      response = await withRetry(
        () =>
          this.client.chat.completions.create({
            model: this.model,
            max_completion_tokens: this.maxTokens,
            messages,
            tools,
            temperature: this.temperature,
          }),
        { maxRetries: 3 }
      );

      choice = response.choices[0];
    }

    // Extract text from final response
    const rawText = choice?.message?.content ?? '';

    return { rawText, toolCalls, citations };
  }

  /**
   * Convert OpenAI SDK errors to standard error types
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'openai');
  }

  /**
   * Generate synthesis by calling OpenAI API directly with synthesis-specific prompts
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
          this.client.chat.completions.create({
            model: this.model,
            max_completion_tokens: this.maxTokens,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: this.temperature,
          }),
        { maxRetries: 3 }
      );

      logger.info({ agentId: this.id, agentName: this.name }, 'Synthesis generation completed');
      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      const convertedError = convertSDKError(error, 'openai');
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
          this.client.chat.completions.create({
            model: this.model,
            max_completion_tokens: this.maxTokens,
            messages: [
              {
                role: 'system',
                content: systemPrompt ?? 'You are a helpful AI assistant. Respond exactly as instructed.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: this.temperature,
          }),
        { maxRetries: 3 }
      );

      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      const convertedError = convertSDKError(error, 'openai');
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
