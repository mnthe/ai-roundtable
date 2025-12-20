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
import { withRetry } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  ToolCallRecord,
  Citation,
  ImageResult,
} from '../types/index.js';

const logger = createLogger('PerplexityAgent');

/** Perplexity API error types that should be retried (uses OpenAI SDK) */
const RETRYABLE_ERRORS = [
  'RateLimitError',
  'APIConnectionError',
  'InternalServerError',
  'APIError', // 5xx errors
];

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

    // Make the API call with Perplexity-specific search options and retry logic
    // Note: Perplexity returns citations in the response when using online models
    let response: OpenAI.Chat.Completions.ChatCompletion = await withRetry(
      () =>
        this.client.chat.completions.create({
          model: this.model,
          max_tokens: this.maxTokens,
          messages,
          tools,
          temperature: this.temperature,
          // Perplexity-specific search options (passed as extra body params)
          ...this.buildSearchParams(),
        } as Parameters<typeof this.client.chat.completions.create>[0]) as Promise<OpenAI.Chat.Completions.ChatCompletion>,
      { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
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
      response = await withRetry(
        () =>
          this.client.chat.completions.create({
            model: this.model,
            max_tokens: this.maxTokens,
            messages,
            tools,
            temperature: this.temperature,
            ...this.buildSearchParams(),
          } as Parameters<typeof this.client.chat.completions.create>[0]) as Promise<OpenAI.Chat.Completions.ChatCompletion>,
        { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
      );

      choice = response.choices[0];
    }

    // Extract text from final response
    const rawText = choice?.message?.content ?? '';

    // Extract metadata from Perplexity's response (citations, images, related questions)
    // Pass rawText to filter citations to only those actually referenced
    const perplexityMetadata = this.extractPerplexityMetadata(response, rawText);
    if (perplexityMetadata.citations.length > 0) {
      citations.push(...perplexityMetadata.citations);
    }

    // Parse the response
    const parsed = this.parseResponse(rawText, context);

    // Validate response has content - use || to catch empty strings (not just null/undefined)
    const position = parsed.position || 'Unable to determine position';
    const reasoning = parsed.reasoning || rawText || 'Unable to determine reasoning';

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        sessionId: context.sessionId,
        agentId: this.id,
        agentName: this.name,
        round: context.currentRound,
        durationMs,
        toolCallCount: toolCalls.length,
        citationCount: citations.length,
        confidence: parsed.confidence ?? 0.5,
      },
      'Agent response generation completed'
    );

    return {
      agentId: this.id,
      agentName: this.name,
      position,
      reasoning,
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
   * Extract domain name from URL for use as a readable title
   * @example "https://www.example.com/path" -> "example.com"
   */
  private extractDomainFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      // Remove 'www.' prefix for cleaner titles
      return hostname.replace(/^www\./, '');
    } catch {
      // If URL parsing fails, return the original string
      return url;
    }
  }

  /**
   * Extract citation reference numbers from response text
   * Looks for patterns like [1], [2], [3], etc.
   * @returns Set of referenced citation indices (1-based)
   */
  private extractCitedIndices(responseText: string): Set<number> {
    const citedIndices = new Set<number>();
    // Match citation markers like [1], [2], [1,2], [1][2], [1, 2, 3]
    const markerPattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
    let match;

    while ((match = markerPattern.exec(responseText)) !== null) {
      // match[1] is guaranteed to exist by the regex pattern
      const captured = match[1];
      if (captured) {
        // Split by comma to handle [1,2,3] format
        const numbers = captured.split(/\s*,\s*/);
        for (const num of numbers) {
          const index = parseInt(num, 10);
          if (!isNaN(index) && index > 0) {
            citedIndices.add(index);
          }
        }
      }
    }

    return citedIndices;
  }

  /**
   * Perplexity response metadata structure
   * NOTE: As of 2025, Perplexity API uses 'search_results' instead of deprecated 'citations' field
   */
  private extractPerplexityMetadata(
    response: OpenAI.Chat.Completions.ChatCompletion,
    responseText?: string
  ): {
    citations: Citation[];
    images: ImageResult[];
    relatedQuestions: string[];
  } {
    const allCitations: Citation[] = [];
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
        allCitations.push({
          title: result.title ?? this.extractDomainFromUrl(result.url),
          url: result.url,
          snippet: result.date ? `Published: ${result.date}` : undefined,
        });
      }
    }
    // Fallback to deprecated citations field for backward compatibility
    else if (anyResponse.citations && Array.isArray(anyResponse.citations)) {
      for (const citation of anyResponse.citations) {
        if (typeof citation === 'string') {
          allCitations.push({
            title: this.extractDomainFromUrl(citation),
            url: citation,
          });
        } else {
          allCitations.push({
            title: citation.title ?? this.extractDomainFromUrl(citation.url),
            url: citation.url,
          });
        }
      }
    }

    // Filter citations to only those actually referenced in the response text
    let citations: Citation[];
    if (responseText && allCitations.length > 0) {
      const citedIndices = this.extractCitedIndices(responseText);
      if (citedIndices.size > 0) {
        // Only include citations that are actually referenced (1-based index)
        citations = allCitations.filter((_, index) => citedIndices.has(index + 1));
      } else {
        // No citation markers found - include all for backward compatibility
        citations = allCitations;
      }
    } else {
      citations = allCitations;
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
   * Generate synthesis by calling Perplexity API directly with synthesis-specific prompts
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
          max_tokens: this.maxTokens,
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
    logger.debug({ agentId: this.id }, 'Generating raw completion');

    const response = await withRetry(
      () =>
        this.client.chat.completions.create({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [
            {
              role: 'system',
              content: systemPrompt ?? 'You are a helpful AI assistant. Respond exactly as instructed.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.temperature,
          // Disable web search for raw completion (consensus analysis doesn't need it)
        }),
      { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
    );

    return response.choices[0]?.message?.content ?? '';
  }

  /**
   * Health check: Test Perplexity API connection with minimal request
   */
  override async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await withRetry(
        () =>
          this.client.chat.completions.create({
            model: this.model,
            max_tokens: 10,
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

  /**
   * Override buildUserMessage for Perplexity to prioritize topic-related search
   *
   * Perplexity automatically searches the web based on the prompt content.
   * By structuring the prompt to emphasize the debate topic FIRST and
   * placing format instructions LAST, we ensure that Perplexity's search
   * focuses on the actual topic rather than "JSON format" keywords.
   */
  protected override buildUserMessage(context: DebateContext): string {
    const parts: string[] = [];

    // CRITICAL: Put the main topic query FIRST for Perplexity's search to pick up
    parts.push(`TOPIC FOR ANALYSIS: ${context.topic}`);
    parts.push('');

    // Add search guidance to help Perplexity focus on relevant sources
    parts.push(
      'Please search for and cite recent, authoritative sources on this topic. ' +
        'Focus on academic papers, news articles, expert opinions, and official reports.'
    );
    parts.push('');

    // Add previous responses context if any
    if (context.previousResponses.length > 0) {
      parts.push('Previous responses in this round:');
      for (const response of context.previousResponses) {
        parts.push(`
--- ${response.agentName} ---
Position: ${response.position}
Reasoning: ${response.reasoning}
Confidence: ${(response.confidence * 100).toFixed(0)}%
${response.citations?.length ? `Sources: ${response.citations.map((c) => c.title).join(', ')}` : ''}
`);
      }
      parts.push('');
    }

    // Put format instructions LAST (after topic-focused content)
    // This prevents Perplexity from searching for "JSON format" related content
    parts.push('Provide your response with the following structure:');
    parts.push('- position: Your clear position statement on the topic');
    parts.push('- reasoning: Your detailed reasoning and arguments with citations');
    parts.push('- confidence: A number from 0.0 to 1.0 indicating your confidence');
    parts.push('');
    parts.push('Format as JSON: {"position": "...", "reasoning": "...", "confidence": 0.0-1.0}');

    logger.debug(
      { topic: context.topic, promptLength: parts.join('\n').length },
      'Built Perplexity-optimized user message'
    );

    return parts.join('\n');
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
