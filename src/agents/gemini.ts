/**
 * Gemini Agent - Google Gemini implementation using the new @google/genai SDK
 *
 * **API CONSTRAINT: Google Search + Function Calling Incompatibility**
 *
 * The Google Gen AI Standard API does NOT support combining Google Search grounding
 * with function calling in the same request. This is a documented API limitation:
 * - Google Search grounding: `tools: [{ googleSearch: {} }]`
 * - Function calling: `tools: [{ functionDeclarations: [...] }]`
 * - CANNOT use both together (only available in Live API with different SDK)
 *
 * **Solution: Two-Phase Approach**
 *
 * To provide both web search citations AND toolkit access, we use a Two-Phase approach:
 *
 * Phase 1 (Web Search): Call with Google Search grounding enabled
 * - Collects web citations and grounding metadata
 * - Uses the heavy model for comprehensive search
 *
 * Phase 2 (Function Calling): Call with function tools (if toolkit available)
 * - Includes Phase 1 search results in context
 * - Enables toolkit functions (get_context, fact_check, etc.)
 * - Allows agent to use tools for additional verification
 *
 * This ensures equal tool access across all agents despite the API constraint.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type {
  Chat,
  FunctionDeclaration,
  Content,
  GroundingMetadata,
  GroundingChunk,
  Tool,
} from '@google/genai';
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';
import { convertSDKError } from './utils/error-converter.js';
import type { AgentConfig, DebateContext, ToolCallRecord, Citation } from '../types/index.js';
import { LIGHT_MODELS } from './setup.js';

const logger = createLogger('GeminiAgent');

/**
 * Google Search grounding configuration options
 */
export interface GoogleSearchConfig {
  /** Enable Google Search grounding (default: true) */
  enabled?: boolean;
}

/**
 * Configuration options for Gemini Agent
 */
export interface GeminiAgentOptions {
  /** Google AI API key (defaults to GOOGLE_API_KEY env var) */
  apiKey?: string;
  /** Custom GoogleGenAI instance (for testing) */
  client?: GoogleGenAI;
  /** Google Search grounding configuration (default: enabled) */
  googleSearch?: GoogleSearchConfig;
  /** Use light model for Phase 1 web search (default: true for cost/speed optimization) */
  useLightModelForSearch?: boolean;
}

/**
 * Gemini Agent using Google's new unified Gen AI SDK (@google/genai)
 *
 * Supports:
 * - Function calling (tools)
 * - Structured response parsing
 * - Citation tracking from tool calls
 * - Multi-turn conversations
 */
export class GeminiAgent extends BaseAgent {
  private client: GoogleGenAI;
  private googleSearchConfig: GoogleSearchConfig;
  private useLightModelForSearch: boolean;

  constructor(config: AgentConfig, options?: GeminiAgentOptions) {
    super(config);

    const apiKey = options?.apiKey ?? process.env.GOOGLE_API_KEY ?? '';

    if (options?.client) {
      this.client = options.client;
    } else {
      this.client = new GoogleGenAI({ apiKey });
    }

    // Google Search grounding enabled by default
    this.googleSearchConfig = {
      enabled: options?.googleSearch?.enabled !== false,
    };

    // Use light model for Phase 1 search by default (faster & cheaper)
    this.useLightModelForSearch = options?.useLightModelForSearch !== false;
  }

  /**
   * Call Gemini API to generate a response using Two-Phase approach
   *
   * **API CONSTRAINT**: Google Search grounding and function calling CANNOT be
   * combined in the same request (Standard API limitation).
   *
   * **Two-Phase Implementation**:
   *
   * Phase 1 (Web Search):
   * - Calls API with Google Search grounding enabled
   * - Collects citations from grounding metadata
   * - Gets initial response with web-sourced evidence
   *
   * Phase 2 (Function Calling) - Only if toolkit available:
   * - Calls API with function tools (no Google Search)
   * - Includes Phase 1 search results in context
   * - Handles function call loop for toolkit access
   * - Merges results with Phase 1 citations
   */
  protected override async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // ============================================================
    // PHASE 1: Web Search with Google Search Grounding
    // Uses light model by default for cost/speed optimization
    // ============================================================
    const phase1Model = this.useLightModelForSearch ? LIGHT_MODELS.google : this.model;
    logger.debug(
      { agentId: this.id, model: phase1Model, useLightModel: this.useLightModelForSearch },
      'Phase 1: Executing with Google Search grounding'
    );

    let phase1Response: Awaited<ReturnType<Chat['sendMessage']>> | null = null;
    let phase1Text = '';

    if (this.googleSearchConfig.enabled) {
      const phase1Chat: Chat = this.client.chats.create({
        model: phase1Model,
        config: {
          systemInstruction: systemPrompt,
          temperature: this.temperature,
          maxOutputTokens: this.maxTokens,
          tools: [{ googleSearch: {} }],
        },
        history: [],
      });

      phase1Response = await withRetry(() => phase1Chat.sendMessage({ message: userMessage }), {
        maxRetries: 3,
      });

      phase1Text = phase1Response.text ?? '';

      // Extract grounding metadata and citations from Google Search
      const groundingMetadata = phase1Response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata) {
        const groundingCitations = this.extractCitationsFromGrounding(groundingMetadata);
        citations.push(...groundingCitations);

        // Record tool call for Google Search grounding
        if (groundingMetadata.groundingChunks && groundingMetadata.groundingChunks.length > 0) {
          toolCalls.push({
            toolName: 'google_search',
            input: { queries: groundingMetadata.webSearchQueries ?? [] },
            output: {
              success: true,
              data: {
                results: groundingMetadata.groundingChunks.map((chunk) => ({
                  title: chunk.web?.title,
                  url: chunk.web?.uri,
                })),
              },
            },
            timestamp: new Date(),
          });
        }

        logger.debug(
          { agentId: this.id, citationCount: groundingCitations.length },
          'Phase 1 complete: Extracted citations from Google Search'
        );
      }
    }

    // ============================================================
    // PHASE 2: Function Calling (if toolkit available)
    // ============================================================
    if (this.toolkit && this.toolkit.getTools().length > 0) {
      logger.debug({ agentId: this.id }, 'Phase 2: Executing with function tools');

      // Build enhanced prompt with Phase 1 search results
      const phase2UserMessage = this.buildPhase2Message(userMessage, phase1Text, citations);

      const phase2Chat: Chat = this.client.chats.create({
        model: this.model,
        config: {
          systemInstruction: systemPrompt,
          temperature: this.temperature,
          maxOutputTokens: this.maxTokens,
          tools: [{ functionDeclarations: this.buildGeminiTools() }],
        },
        history: [],
      });

      let response = await withRetry(() => phase2Chat.sendMessage({ message: phase2UserMessage }), {
        maxRetries: 3,
      });

      // Handle function calling loop
      while (response.functionCalls && response.functionCalls.length > 0) {
        const functionCalls = response.functionCalls;
        const functionResponses: Array<{
          id?: string;
          name: string;
          response: Record<string, unknown>;
        }> = [];

        for (const functionCall of functionCalls) {
          const toolResult = await this.executeTool(functionCall.name ?? '', functionCall.args);

          toolCalls.push({
            toolName: functionCall.name ?? 'unknown',
            input: functionCall.args,
            output: toolResult,
            timestamp: new Date(),
          });

          // Extract citations from toolkit tool results
          const extractedCitations = this.extractCitationsFromToolResult(
            functionCall.name ?? '',
            toolResult
          );
          citations.push(...extractedCitations);

          functionResponses.push({
            id: functionCall.id,
            name: functionCall.name ?? '',
            response: toolResult as Record<string, unknown>,
          });
        }

        // Send function responses back
        response = await withRetry(
          () =>
            phase2Chat.sendMessage({
              message: functionResponses.map((fr) => ({
                functionResponse: {
                  id: fr.id,
                  name: fr.name,
                  response: fr.response,
                },
              })),
            }),
          { maxRetries: 3 }
        );
      }

      // Use Phase 2 response as final text (includes both search context and tool results)
      const rawText = response.text ?? '';
      logger.debug({ agentId: this.id }, 'Phase 2 complete: Function calling finished');

      return { rawText, toolCalls, citations };
    }

    // If no toolkit, use Phase 1 response directly
    return { rawText: phase1Text, toolCalls, citations };
  }

  /**
   * Build Phase 2 message with Phase 1 search results included
   *
   * This ensures the model has access to web search results even though
   * Google Search grounding is not available in the function calling phase.
   */
  private buildPhase2Message(
    originalMessage: string,
    phase1Response: string,
    citations: Citation[]
  ): string {
    if (!phase1Response && citations.length === 0) {
      return originalMessage;
    }

    const searchResultsSummary = citations.length > 0
      ? `\n\nWeb Search Results (from Phase 1):\n${citations
          .map((c, i) => `[${i + 1}] ${c.title}: ${c.url}`)
          .join('\n')}`
      : '';

    const previousAnalysis = phase1Response
      ? `\n\nPrevious Analysis (with web search):\n${phase1Response}`
      : '';

    return `${originalMessage}${searchResultsSummary}${previousAnalysis}

Please provide your final response. You have access to additional tools (request_context, fact_check) if you need to verify any claims or get more context.`;
  }

  /**
   * Convert Google SDK errors to standard error types
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'google');
  }

  /**
   * Perform synthesis by calling Gemini API directly with synthesis-specific prompts
   * This bypasses the standard debate prompt building to use synthesis format
   */
  protected override async performSynthesis(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    const response = await withRetry(
      () =>
        this.client.models.generateContent({
          model: this.model,
          contents: userMessage,
          config: {
            systemInstruction: systemPrompt,
            temperature: this.temperature,
            maxOutputTokens: this.maxTokens,
          },
        }),
      { maxRetries: 3 }
    );

    return response.text ?? '';
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
          this.client.models.generateContent({
            model: this.model,
            contents: prompt,
            config: {
              systemInstruction:
                systemPrompt ?? 'You are a helpful AI assistant. Respond exactly as instructed.',
              temperature: this.temperature,
              maxOutputTokens: this.maxTokens,
            },
          }),
        { maxRetries: 3 }
      );

      return response.text ?? '';
    } catch (error) {
      const convertedError = convertSDKError(error, 'google');
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
    const response = await withRetry(
      () =>
        this.client.models.generateContent({
          model: this.model,
          contents: 'test',
          config: {
            maxOutputTokens: 10,
            // Disable thinking for health check to get standard text response
            // Gemini 3 models have thinking enabled by default which changes response structure
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
      { maxRetries: 3 }
    );
    // Check if we got a valid response
    if (response.text === undefined) {
      throw new Error('No response text');
    }
  }

  /**
   * Build Gemini-format tool definitions from toolkit
   * Uses the new @google/genai SDK format with parametersJsonSchema
   */
  private buildGeminiTools(): FunctionDeclaration[] {
    if (!this.toolkit) {
      return [];
    }

    return this.toolkit.getTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: Type.OBJECT,
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, value]) => [
            key,
            {
              type: Type.STRING,
              description: (value as { description?: string }).description ?? '',
            },
          ])
        ),
        required: Object.keys(tool.parameters),
      },
    }));
  }

  /**
   * Extract citations from Google Search grounding metadata
   */
  private extractCitationsFromGrounding(metadata: GroundingMetadata): Citation[] {
    const chunks = metadata.groundingChunks ?? [];

    return chunks
      .filter((chunk: GroundingChunk) => chunk.web?.uri)
      .map((chunk: GroundingChunk) => ({
        title: chunk.web?.title ?? 'Untitled',
        url: chunk.web?.uri ?? '',
        snippet: undefined,
      }));
  }
}

/**
 * Factory function for creating Gemini agents
 */
export function createGeminiAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: GeminiAgentOptions
): GeminiAgent {
  const agent = new GeminiAgent(config, options);
  if (toolkit) {
    agent.setToolkit(toolkit);
  }
  return agent;
}
