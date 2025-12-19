/**
 * ChatGPT Agent - OpenAI ChatGPT implementation
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { BaseAgent, type AgentToolkit } from './base.js';
import { withRetry } from '../utils/retry.js';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  ToolCallRecord,
  Citation,
} from '../types/index.js';

/** OpenAI SDK error types that should be retried */
const RETRYABLE_ERRORS = [
  'RateLimitError',
  'APIConnectionError',
  'InternalServerError',
  'APIError', // 5xx errors
];

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
   * Generate a response using OpenAI API
   */
  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // Build tools if toolkit is available
    const tools = this.toolkit ? this.buildOpenAITools() : undefined;

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
      { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
    );

    let choice = response.choices[0];

    // Handle tool call loop
    while (choice?.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      const assistantMessage = choice.message;
      const currentToolCalls = choice.message.tool_calls; // Use choice.message directly for narrowing
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
        // search_web returns: { success: boolean, data: { results: SearchResult[] } }
        // perplexity_search returns: { success: boolean, data: { answer: string, citations?: Citation[], ... } }
        if (result && typeof result === 'object') {
          const toolResult = result as {
            success?: boolean;
            data?: {
              results?: Array<{ title: string; url: string; snippet?: string }>;
              citations?: Array<{ title: string; url: string; snippet?: string }>;
            };
          };

          if (toolResult.success && toolResult.data) {
            // Handle search_web format
            if (functionName === 'search_web' && toolResult.data.results) {
              for (const item of toolResult.data.results) {
                citations.push({
                  title: item.title,
                  url: item.url,
                  snippet: item.snippet,
                });
              }
            }
            // Handle perplexity_search format
            else if (functionName === 'perplexity_search' && toolResult.data.citations) {
              for (const item of toolResult.data.citations) {
                citations.push({
                  title: item.title,
                  url: item.url,
                  snippet: item.snippet,
                });
              }
            }
          }
        }

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
        { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
      );

      choice = response.choices[0];
    }

    // Extract text from final response
    const rawText = choice?.message?.content ?? '';

    // Check if agent used submit_response tool
    const submitResponseCall = toolCalls.find((tc) => tc.toolName === 'submit_response');
    let parsed: Partial<AgentResponse>;

    if (submitResponseCall && submitResponseCall.output) {
      // Extract from submit_response tool result
      const toolOutput = submitResponseCall.output as {
        success?: boolean;
        data?: {
          position?: string;
          reasoning?: string;
          confidence?: number;
        };
      };

      if (toolOutput.success && toolOutput.data) {
        parsed = {
          position: toolOutput.data.position ?? 'Unable to determine position',
          reasoning: toolOutput.data.reasoning ?? 'Unable to determine reasoning',
          confidence: Math.min(1, Math.max(0, toolOutput.data.confidence ?? 0.5)),
        };
      } else {
        // Tool call failed, fall back to parsing text
        parsed = this.parseResponse(rawText, context);
      }
    } else {
      // No submit_response tool call, parse from text
      parsed = this.parseResponse(rawText, context);
    }

    // Validate response has content - use || to catch empty strings (not just null/undefined)
    const position = parsed.position || 'Unable to determine position';
    const reasoning = parsed.reasoning || rawText || 'Unable to determine reasoning';

    return {
      agentId: this.id,
      agentName: this.name,
      position,
      reasoning,
      confidence: parsed.confidence ?? 0.5,
      citations: citations.length > 0 ? citations : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: new Date(),
    };
  }

  /**
   * Generate synthesis by calling OpenAI API directly with synthesis-specific prompts
   * This bypasses the standard debate prompt building to use synthesis format
   */
  protected override async generateSynthesisInternal(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
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
      { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
    );

    return response.choices[0]?.message?.content ?? '';
  }

  /**
   * Generate a raw text completion without parsing into structured format
   * Used by AIConsensusAnalyzer to get raw JSON responses
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
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
      { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
    );

    return response.choices[0]?.message?.content ?? '';
  }

  /**
   * Health check: Test OpenAI API connection with minimal request
   */
  override async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await withRetry(
        () =>
          this.client.chat.completions.create({
            model: this.model,
            max_completion_tokens: 10,
            messages: [{ role: 'user', content: 'test' }],
          }),
        { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
      );
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build OpenAI-format tool definitions from toolkit
   */
  private buildOpenAITools(): ChatCompletionTool[] {
    if (!this.toolkit) {
      return [];
    }

    return this.toolkit.getTools().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object' as const,
          properties: tool.parameters,
          required: Object.keys(tool.parameters),
        },
      },
    }));
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
