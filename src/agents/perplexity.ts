/**
 * Perplexity Agent - Perplexity AI implementation using official SDK
 *
 * Uses the official @perplexity-ai/perplexity_ai SDK for native TypeScript
 * support and built-in web search capabilities.
 */

import Perplexity from '@perplexity-ai/perplexity_ai';
import type {
  ChatMessageInput,
  ChatMessageOutput,
  APIPublicSearchResult,
} from '@perplexity-ai/perplexity_ai/resources';
import type { StreamChunk } from '@perplexity-ai/perplexity_ai/resources/chat/chat';
import type { CompletionCreateParams } from '@perplexity-ai/perplexity_ai/resources/chat/completions';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';
import { convertSDKError } from './utils/index.js';
import type { AgentConfig, DebateContext, ToolCallRecord, Citation } from '../types/index.js';

const logger = createLogger('PerplexityAgent');

/**
 * Search recency filter options
 */
export type SearchRecencyFilter = 'hour' | 'day' | 'week' | 'month' | 'year';

/**
 * Perplexity search configuration options
 * These options control how Perplexity searches the web
 */
export interface PerplexitySearchOptions {
  /** Filter results by recency */
  recencyFilter?: SearchRecencyFilter;
  /** Limit search to specific domains (max 3) */
  domainFilter?: string[];
}

/**
 * Configuration options for Perplexity Agent
 */
export interface PerplexityAgentOptions {
  /** Perplexity API key (defaults to PERPLEXITY_API_KEY env var) */
  apiKey?: string;
  /** Custom Perplexity client instance (for testing) */
  client?: Perplexity;
  /** Search-specific options for Perplexity's web search */
  searchOptions?: PerplexitySearchOptions;
}

/**
 * Perplexity Agent using the official Perplexity SDK
 *
 * Perplexity models have built-in web search capabilities.
 * Supported models (2025):
 * - sonar: Fast, lightweight model based on Llama 3.3 70B
 * - sonar-pro: Enhanced search with richer context
 * - sonar-reasoning: Chain-of-thought reasoning with live search
 * - sonar-reasoning-pro: Advanced reasoning powered by DeepSeek-R1
 *
 * Supports:
 * - Built-in web search (citations returned automatically via search_results)
 * - Function calling (tools)
 * - Structured response parsing
 */
export class PerplexityAgent extends BaseAgent {
  private client: Perplexity;
  private searchOptions: PerplexitySearchOptions;

  constructor(config: AgentConfig, options?: PerplexityAgentOptions) {
    super(config);
    this.searchOptions = options?.searchOptions ?? {};

    if (options?.client) {
      this.client = options.client;
    } else {
      this.client = new Perplexity({
        apiKey: options?.apiKey ?? process.env.PERPLEXITY_API_KEY,
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
   * Note: Perplexity has built-in web search and returns citations via search_results field.
   */
  protected override async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    const messages: ChatMessageInput[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // Build tools if toolkit is available (Perplexity supports function calling)
    const tools = this.buildPerplexityTools();

    // Make the API call with Perplexity-specific search options and retry logic
    let response: StreamChunk = await withRetry(
      () =>
        this.client.chat.completions.create({
          model: this.model,
          max_tokens: this.maxTokens,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          temperature: this.temperature,
          // Perplexity-specific search options
          search_recency_filter: this.searchOptions.recencyFilter ?? null,
          search_domain_filter:
            this.searchOptions.domainFilter && this.searchOptions.domainFilter.length > 0
              ? this.searchOptions.domainFilter.slice(0, 3)
              : null,
        }),
      { maxRetries: 3 }
    );

    let choice = response.choices[0];

    // Handle tool call loop - check if message has tool_calls
    while (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      const assistantMessage = choice.message;
      const currentToolCalls = choice.message.tool_calls;
      messages.push(assistantMessage);

      for (const toolCall of currentToolCalls ?? []) {
        // Skip non-function tool calls
        if (toolCall.type !== 'function' || !toolCall.function) continue;

        const functionName = toolCall.function.name ?? '';
        const functionArgs = JSON.parse(toolCall.function.arguments ?? '{}');

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

        const toolResultMessage: ChatMessageInput = {
          role: 'tool',
          tool_call_id: toolCall.id ?? null,
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
            tools: tools.length > 0 ? tools : undefined,
            temperature: this.temperature,
            search_recency_filter: this.searchOptions.recencyFilter ?? null,
            search_domain_filter:
              this.searchOptions.domainFilter && this.searchOptions.domainFilter.length > 0
                ? this.searchOptions.domainFilter.slice(0, 3)
                : null,
          }),
        { maxRetries: 3 }
      );

      choice = response.choices[0];
    }

    // Extract text from final response
    const rawText = this.extractContentText(choice?.message);

    // Extract citations from Perplexity's native search_results field
    const perplexityCitations = this.extractPerplexityCitations(response, rawText);
    if (perplexityCitations.length > 0) {
      citations.push(...perplexityCitations);

      // Record built-in web search as a tool call for consistency with other agents
      toolCalls.push({
        toolName: 'perplexity_search',
        input: { query: context.topic },
        output: {
          success: true,
          data: {
            results: perplexityCitations.map((c) => ({
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
    };
  }

  /**
   * Convert Perplexity SDK errors to standard error types
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'perplexity');
  }

  /**
   * Build Perplexity-format tool definitions from toolkit
   */
  private buildPerplexityTools(): CompletionCreateParams.Tool[] {
    if (!this.toolkit) {
      return [];
    }

    return this.toolkit.getTools().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters,
          required: Object.keys(tool.parameters),
        },
      },
    }));
  }

  /**
   * Extract text content from message (handles both string and array content)
   */
  private extractContentText(message: ChatMessageOutput | undefined): string {
    if (!message) return '';

    const content = message.content;
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter((chunk): chunk is ChatMessageOutput.ChatMessageContentTextChunk => chunk.type === 'text')
        .map((chunk) => chunk.text)
        .join('');
    }

    return '';
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
   * Extract citations from Perplexity response's native search_results field
   * The official SDK provides search_results directly in the response
   */
  private extractPerplexityCitations(response: StreamChunk, responseText?: string): Citation[] {
    const allCitations: Citation[] = [];

    // Extract citations from native search_results field (preferred)
    // Defensive check: ensure search_results is an array
    if (response.search_results && Array.isArray(response.search_results) && response.search_results.length > 0) {
      for (const result of response.search_results) {
        // Skip malformed results without URL
        if (!result || typeof result.url !== 'string') continue;
        allCitations.push({
          title: result.title ?? this.extractDomainFromUrl(result.url),
          url: result.url,
          snippet: result.date ? `Published: ${result.date}` : result.snippet,
        });
      }
    }
    // Fallback to deprecated citations field (string URLs)
    // Defensive check: ensure citations is an array
    else if (response.citations && Array.isArray(response.citations) && response.citations.length > 0) {
      for (const url of response.citations) {
        // Skip non-string citations
        if (typeof url !== 'string') continue;
        allCitations.push({
          title: this.extractDomainFromUrl(url),
          url: url,
        });
      }
    }

    if (allCitations.length === 0) {
      logger.debug({ responseId: response.id }, 'No citations found in response');
      return [];
    }

    // Filter citations to only those actually referenced in the response text
    if (responseText && allCitations.length > 0) {
      const citedIndices = this.extractCitedIndices(responseText);
      if (citedIndices.size > 0) {
        // Only include citations that are actually referenced (1-based index)
        return allCitations.filter((_, index) => citedIndices.has(index + 1));
      }
    }

    return allCitations;
  }

  /**
   * Perform synthesis by calling Perplexity API directly with synthesis-specific prompts
   */
  protected override async performSynthesis(systemPrompt: string, userMessage: string): Promise<string> {
    logger.debug({ agentId: this.id }, 'Performing synthesis');

    try {
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
        { maxRetries: 3 }
      );

      return this.extractContentText(response.choices[0]?.message);
    } catch (error) {
      const convertedError = this.convertError(error);
      logger.error({ err: convertedError, agentId: this.id }, 'Failed to perform synthesis');
      throw convertedError;
    }
  }

  /**
   * Generate a raw text completion without parsing into structured format
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug({ agentId: this.id }, 'Generating raw completion');

    try {
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
          }),
        { maxRetries: 3 }
      );

      return this.extractContentText(response.choices[0]?.message);
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
