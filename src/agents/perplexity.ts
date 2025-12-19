/**
 * Perplexity Agent - Perplexity AI implementation
 *
 * Perplexity uses an OpenAI-compatible API with built-in web search capabilities.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { BaseAgent, type AgentToolkit } from './base.js';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  ToolCallRecord,
  Citation,
  ImageResult,
} from '../types/index.js';

/**
 * Search recency filter options
 */
export type SearchRecencyFilter = 'hour' | 'day' | 'week' | 'month';

/**
 * Perplexity search configuration options
 * These options control how Perplexity searches the web
 */
export interface PerplexitySearchOptions {
  /** Filter results by recency */
  recencyFilter?: SearchRecencyFilter;
  /** Limit search to specific domains (max 3) */
  domainFilter?: string[];
  /** Include images in results */
  returnImages?: boolean;
  /** Include related questions in results */
  returnRelatedQuestions?: boolean;
}

/**
 * Configuration options for Perplexity Agent
 */
export interface PerplexityAgentOptions {
  /** Perplexity API key (defaults to PERPLEXITY_API_KEY env var) */
  apiKey?: string;
  /** Custom OpenAI-compatible client instance (for testing) */
  client?: OpenAI;
  /** Search-specific options for Perplexity's web search */
  searchOptions?: PerplexitySearchOptions;
}

/**
 * Perplexity Agent using Perplexity's OpenAI-compatible API
 *
 * Perplexity models have built-in web search capabilities.
 * Supported models (2025):
 * - sonar: Fast, lightweight model based on Llama 3.3 70B
 * - sonar-pro: Enhanced search with richer context
 * - sonar-reasoning: Chain-of-thought reasoning with live search
 * - sonar-reasoning-pro: Advanced reasoning powered by DeepSeek-R1
 *
 * Supports:
 * - Built-in web search (citations returned automatically)
 * - Function calling (tools)
 * - Structured response parsing
 */
export class PerplexityAgent extends BaseAgent {
  private client: OpenAI;
  private searchOptions: PerplexitySearchOptions;

  constructor(config: AgentConfig, options?: PerplexityAgentOptions) {
    super(config);
    this.searchOptions = options?.searchOptions ?? {};

    if (options?.client) {
      this.client = options.client;
    } else {
      this.client = new OpenAI({
        apiKey: options?.apiKey ?? process.env.PERPLEXITY_API_KEY,
        baseURL: 'https://api.perplexity.ai',
      });
    }
  }

  /**
   * Update search options dynamically
   */
  setSearchOptions(options: PerplexitySearchOptions): void {
    this.searchOptions = { ...this.searchOptions, ...options };
  }

  /**
   * Get current search options
   */
  getSearchOptions(): PerplexitySearchOptions {
    return { ...this.searchOptions };
  }

  /**
   * Generate a response using Perplexity API
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

    // Build tools if toolkit is available (Perplexity supports function calling)
    const tools = this.toolkit ? this.buildOpenAITools() : undefined;

    // Make the API call with Perplexity-specific search options
    // Note: Perplexity returns citations in the response when using online models
    let response: OpenAI.Chat.Completions.ChatCompletion = (await this.client.chat.completions.create(
      {
        model: this.model,
        max_tokens: this.maxTokens,
        messages,
        tools,
        temperature: this.temperature,
        // Perplexity-specific search options (passed as extra body params)
        ...this.buildSearchParams(),
      } as Parameters<typeof this.client.chat.completions.create>[0]
    )) as OpenAI.Chat.Completions.ChatCompletion;

    let choice = response.choices[0];

    // Handle tool call loop
    while (choice?.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      const assistantMessage = choice.message;
      const currentToolCalls = choice.message.tool_calls;
      messages.push(assistantMessage);

      for (const toolCall of currentToolCalls ?? []) {
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
        // Tool results are wrapped in { success: boolean, data: { results: [...] } }
        if (
          (functionName === 'search_web' || functionName === 'perplexity_search') &&
          result &&
          typeof result === 'object'
        ) {
          const toolResult = result as {
            success?: boolean;
            data?: { results?: Array<{ title: string; url: string; snippet?: string }> };
          };
          if (toolResult.success && toolResult.data?.results) {
            for (const item of toolResult.data.results) {
              citations.push({
                title: item.title,
                url: item.url,
                snippet: item.snippet,
              });
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
      response = (await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages,
        tools,
        temperature: this.temperature,
        ...this.buildSearchParams(),
      } as Parameters<typeof this.client.chat.completions.create>[0])) as OpenAI.Chat.Completions.ChatCompletion;

      choice = response.choices[0];
    }

    // Extract text from final response
    const rawText = choice?.message?.content ?? '';

    // Extract metadata from Perplexity's response (citations, images, related questions)
    const perplexityMetadata = this.extractPerplexityMetadata(response);
    if (perplexityMetadata.citations.length > 0) {
      citations.push(...perplexityMetadata.citations);
    }

    // Parse the response
    const parsed = this.parseResponse(rawText, context);

    return {
      agentId: this.id,
      agentName: this.name,
      position: parsed.position ?? 'Unable to determine position',
      reasoning: parsed.reasoning ?? rawText,
      confidence: parsed.confidence ?? 0.5,
      citations: citations.length > 0 ? citations : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      images: perplexityMetadata.images.length > 0 ? perplexityMetadata.images : undefined,
      relatedQuestions:
        perplexityMetadata.relatedQuestions.length > 0
          ? perplexityMetadata.relatedQuestions
          : undefined,
      timestamp: new Date(),
    };
  }

  /**
   * Build Perplexity-specific search parameters
   * These are passed as additional body parameters to the API
   */
  private buildSearchParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (this.searchOptions.recencyFilter) {
      params.search_recency_filter = this.searchOptions.recencyFilter;
    }

    if (this.searchOptions.domainFilter && this.searchOptions.domainFilter.length > 0) {
      // Perplexity limits to 3 domains
      params.search_domain_filter = this.searchOptions.domainFilter.slice(0, 3);
    }

    if (this.searchOptions.returnImages !== undefined) {
      params.return_images = this.searchOptions.returnImages;
    }

    if (this.searchOptions.returnRelatedQuestions !== undefined) {
      params.return_related_questions = this.searchOptions.returnRelatedQuestions;
    }

    return params;
  }

  /**
   * Perplexity response metadata structure
   * NOTE: As of 2025, Perplexity API uses 'search_results' instead of deprecated 'citations' field
   */
  private extractPerplexityMetadata(response: OpenAI.Chat.Completions.ChatCompletion): {
    citations: Citation[];
    images: ImageResult[];
    relatedQuestions: string[];
  } {
    const citations: Citation[] = [];
    const images: ImageResult[] = [];
    const relatedQuestions: string[] = [];

    // Perplexity may include extra metadata in response
    // The exact format depends on the API version
    const anyResponse = response as unknown as {
      citations?: Array<string | { url: string; title?: string }>; // Deprecated, kept for backward compatibility
      search_results?: Array<{ url: string; title?: string; date?: string }>; // New format (2025+)
      images?: Array<string | { url: string; description?: string }>;
      related_questions?: string[];
    };

    // Extract citations from search_results (new format, preferred)
    if (anyResponse.search_results && Array.isArray(anyResponse.search_results)) {
      for (const result of anyResponse.search_results) {
        citations.push({
          title: result.title ?? result.url,
          url: result.url,
          snippet: result.date ? `Published: ${result.date}` : undefined,
        });
      }
    }
    // Fallback to deprecated citations field for backward compatibility
    else if (anyResponse.citations && Array.isArray(anyResponse.citations)) {
      for (const citation of anyResponse.citations) {
        if (typeof citation === 'string') {
          citations.push({
            title: citation,
            url: citation,
          });
        } else {
          citations.push({
            title: citation.title ?? citation.url,
            url: citation.url,
          });
        }
      }
    }

    // Extract images
    if (anyResponse.images && Array.isArray(anyResponse.images)) {
      for (const image of anyResponse.images) {
        if (typeof image === 'string') {
          images.push({ url: image });
        } else {
          images.push({
            url: image.url,
            description: image.description,
          });
        }
      }
    }

    // Extract related questions
    if (anyResponse.related_questions && Array.isArray(anyResponse.related_questions)) {
      relatedQuestions.push(...anyResponse.related_questions);
    }

    return { citations, images, relatedQuestions };
  }

  /**
   * Health check: Test Perplexity API connection with minimal request
   */
  override async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.client.chat.completions.create({
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
 * Factory function for creating Perplexity agents
 */
export function createPerplexityAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: PerplexityAgentOptions
): PerplexityAgent {
  const agent = new PerplexityAgent(config, options);
  if (toolkit) {
    agent.setToolkit(toolkit);
  }
  return agent;
}
