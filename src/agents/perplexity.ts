/**
 * Perplexity Agent - Perplexity AI implementation
 *
 * Perplexity uses an OpenAI-compatible API with built-in web search capabilities.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';
import {
  buildOpenAITools,
  convertSDKError,
  executeSimpleOpenAICompletion,
} from './utils/index.js';
import type { AgentConfig, DebateContext, ToolCallRecord, Citation, ImageResult } from '../types/index.js';

const logger = createLogger('PerplexityAgent');

// ============================================
// Perplexity Extended Response Type Guard
// ============================================

/**
 * Perplexity-specific extended response fields
 * These fields are not part of the standard OpenAI API response
 */
interface PerplexityExtendedResponse {
  /** Deprecated citations field (array of URLs or citation objects) */
  citations?: Array<string | { url: string; title?: string }>;
  /** New search_results field (2025+) */
  search_results?: Array<{ url: string; title?: string; date?: string }>;
  /** Images found during search */
  images?: Array<string | { url: string; description?: string }>;
  /** Related questions suggested by Perplexity */
  related_questions?: string[];
}

/**
 * Type guard to check if a response has Perplexity extended fields
 * Validates the structure of Perplexity-specific metadata
 */
function hasPerplexityExtensions(response: unknown): response is PerplexityExtendedResponse {
  if (typeof response !== 'object' || response === null) {
    return false;
  }

  const obj = response as Record<string, unknown>;

  // Check citations field (deprecated format)
  if (obj.citations !== undefined) {
    if (!Array.isArray(obj.citations)) return false;
    for (const citation of obj.citations) {
      if (typeof citation !== 'string') {
        if (typeof citation !== 'object' || citation === null) return false;
        const citationObj = citation as Record<string, unknown>;
        if (typeof citationObj.url !== 'string') return false;
        if (citationObj.title !== undefined && typeof citationObj.title !== 'string') return false;
      }
    }
  }

  // Check search_results field (new format)
  if (obj.search_results !== undefined) {
    if (!Array.isArray(obj.search_results)) return false;
    for (const result of obj.search_results) {
      if (typeof result !== 'object' || result === null) return false;
      const resultObj = result as Record<string, unknown>;
      if (typeof resultObj.url !== 'string') return false;
      if (resultObj.title !== undefined && typeof resultObj.title !== 'string') return false;
      if (resultObj.date !== undefined && typeof resultObj.date !== 'string') return false;
    }
  }

  // Check images field
  if (obj.images !== undefined) {
    if (!Array.isArray(obj.images)) return false;
    for (const image of obj.images) {
      if (typeof image !== 'string') {
        if (typeof image !== 'object' || image === null) return false;
        const imageObj = image as Record<string, unknown>;
        if (typeof imageObj.url !== 'string') return false;
        if (imageObj.description !== undefined && typeof imageObj.description !== 'string') return false;
      }
    }
  }

  // Check related_questions field
  if (obj.related_questions !== undefined) {
    if (!Array.isArray(obj.related_questions)) return false;
    for (const question of obj.related_questions) {
      if (typeof question !== 'string') return false;
    }
  }

  return true;
}

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
   * Call Perplexity API to generate a response
   *
   * Implements the provider-specific API call for the template method pattern.
   * Note: Perplexity has built-in web search and returns citations, images, and related questions.
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

    // Build tools if toolkit is available (Perplexity supports function calling)
    const tools = buildOpenAITools(this.toolkit);

    // Make the API call with Perplexity-specific search options and retry logic
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
            max_tokens: this.maxTokens,
            messages,
            tools,
            temperature: this.temperature,
            ...this.buildSearchParams(),
          } as Parameters<typeof this.client.chat.completions.create>[0]) as Promise<OpenAI.Chat.Completions.ChatCompletion>,
        { maxRetries: 3 }
      );

      choice = response.choices[0];
    }

    // Extract text from final response
    const rawText = choice?.message?.content ?? '';

    // Extract metadata from Perplexity's response (citations, images, related questions)
    const perplexityMetadata = this.extractPerplexityMetadata(response, rawText);
    if (perplexityMetadata.citations.length > 0) {
      citations.push(...perplexityMetadata.citations);

      // Record built-in web search as a tool call for consistency with other agents
      toolCalls.push({
        toolName: 'perplexity_search',
        input: { query: context.topic },
        output: {
          success: true,
          data: {
            results: perplexityMetadata.citations.map((c) => ({
              title: c.title,
              url: c.url,
            })),
          },
        },
        timestamp: new Date(),
      });
    }

    return {
      rawText,
      toolCalls,
      citations,
      images: perplexityMetadata.images,
      relatedQuestions: perplexityMetadata.relatedQuestions,
    };
  }

  /**
   * Convert Perplexity SDK errors to standard error types
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'perplexity');
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

    // Use type guard to safely validate Perplexity extended fields
    if (!hasPerplexityExtensions(response)) {
      logger.debug(
        { responseId: response.id },
        'Response does not have valid Perplexity extensions, returning empty metadata'
      );
      return { citations: [], images: [], relatedQuestions: [] };
    }

    const perplexityResponse = response;

    // Extract citations from search_results (new format, preferred)
    if (perplexityResponse.search_results) {
      for (const result of perplexityResponse.search_results) {
        allCitations.push({
          title: result.title ?? this.extractDomainFromUrl(result.url),
          url: result.url,
          snippet: result.date ? `Published: ${result.date}` : undefined,
        });
      }
    }
    // Fallback to deprecated citations field for backward compatibility
    else if (perplexityResponse.citations) {
      for (const citation of perplexityResponse.citations) {
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
    if (perplexityResponse.images) {
      for (const image of perplexityResponse.images) {
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
    if (perplexityResponse.related_questions) {
      relatedQuestions.push(...perplexityResponse.related_questions);
    }

    return { citations, images, relatedQuestions };
  }

  /**
   * Perform synthesis by calling Perplexity API directly with synthesis-specific prompts
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
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }],
        }),
      { maxRetries: 3 }
    );
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
