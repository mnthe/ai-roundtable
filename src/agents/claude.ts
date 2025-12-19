/**
 * Claude Agent - Anthropic Claude implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { createLogger } from '../utils/logger.js';
import { BaseAgent, type AgentToolkit } from './base.js';
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

      // Make the API call
      let response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages,
        tools,
        temperature: this.temperature,
      });

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
            if (toolUse.name === 'search_web' && toolResult.data.results) {
              for (const item of toolResult.data.results) {
                citations.push({
                  title: item.title,
                  url: item.url,
                  snippet: item.snippet,
                });
              }
            }
            // Handle perplexity_search format
            else if (toolUse.name === 'perplexity_search' && toolResult.data.citations) {
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

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Continue the conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages,
        tools,
        temperature: this.temperature,
      });
    }

    // Extract text from final response
    const textBlocks = response.content.filter(
      (block): block is TextBlock => block.type === 'text'
    );
    const rawText = textBlocks.map((block) => block.text).join('\n');

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

      const result: AgentResponse = {
        agentId: this.id,
        agentName: this.name,
        position,
        reasoning,
        confidence: parsed.confidence ?? 0.5,
        citations: citations.length > 0 ? citations : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: new Date(),
      };

      const duration = Date.now() - startTime;
      logger.info(
        {
          sessionId: context.sessionId,
          agentId: this.id,
          agentName: this.name,
          round: context.currentRound,
          duration,
          confidence: result.confidence,
          toolCallCount: toolCalls.length,
          citationCount: citations.length,
        },
        'Agent response generation completed'
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          err: error,
          sessionId: context.sessionId,
          agentId: this.id,
          agentName: this.name,
          round: context.currentRound,
          duration,
        },
        'Failed to generate agent response'
      );
      throw error;
    }
  }

  /**
   * Health check: Test Claude API connection with minimal request
   */
  override async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a tool call using the toolkit
   */
  private async executeTool(name: string, input: unknown): Promise<unknown> {
    if (!this.toolkit) {
      return { error: 'No toolkit available' };
    }

    try {
      return await this.toolkit.executeTool(name, input);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
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
