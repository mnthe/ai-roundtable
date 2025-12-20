/**
 * Gemini Agent - Google Gemini implementation using the new @google/genai SDK
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { Chat, FunctionDeclaration, Content } from '@google/genai';
import { BaseAgent, type AgentToolkit } from './base.js';
import { withRetry } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  ToolCallRecord,
  Citation,
} from '../types/index.js';

const logger = createLogger('GeminiAgent');

/** Google Gen AI error types that should be retried */
const RETRYABLE_ERRORS = [
  'GoogleGenerativeAIError', // Generic SDK error
  'GoogleGenerativeAIFetchError', // Network/fetch errors
  'GoogleGenerativeAIResponseError', // Server-side errors (5xx)
];

/**
 * Configuration options for Gemini Agent
 */
export interface GeminiAgentOptions {
  /** Google AI API key (defaults to GOOGLE_API_KEY env var) */
  apiKey?: string;
  /** Custom GoogleGenAI instance (for testing) */
  client?: GoogleGenAI;
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
  private ai: GoogleGenAI;

  constructor(config: AgentConfig, options?: GeminiAgentOptions) {
    super(config);

    const apiKey = options?.apiKey ?? process.env.GOOGLE_API_KEY ?? '';

    if (options?.client) {
      this.ai = options.client;
    } else {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  /**
   * Generate a response using Gemini API
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

    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // Build tools if toolkit is available
    const tools = this.toolkit ? this.buildGeminiTools() : undefined;

    // Build chat history
    const history: Content[] = [];

    // Create chat session with system instruction in config
    const chat: Chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: systemPrompt,
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
        tools: tools ? [{ functionDeclarations: tools }] : undefined,
      },
      history,
    });

    // Send message with retry logic
    let response = await withRetry(
      () => chat.sendMessage({ message: userMessage }),
      { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
    );

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

        // Extract citations from search results
        // search_web returns: { success: boolean, data: { results: SearchResult[] } }
        // perplexity_search returns: { success: boolean, data: { answer: string, citations?: Citation[], ... } }
        if (toolResult && typeof toolResult === 'object') {
          const result = toolResult as {
            success?: boolean;
            data?: {
              results?: Array<{ title: string; url: string; snippet?: string }>;
              citations?: Array<{ title: string; url: string; snippet?: string }>;
            };
          };

          if (result.success && result.data) {
            // Handle search_web format
            if (functionCall.name === 'search_web' && result.data.results) {
              for (const item of result.data.results) {
                citations.push({
                  title: item.title,
                  url: item.url,
                  snippet: item.snippet,
                });
              }
            }
            // Handle perplexity_search format
            else if (functionCall.name === 'perplexity_search' && result.data.citations) {
              for (const item of result.data.citations) {
                citations.push({
                  title: item.title,
                  url: item.url,
                  snippet: item.snippet,
                });
              }
            }
          }
        }

        functionResponses.push({
          id: functionCall.id,
          name: functionCall.name ?? '',
          response: toolResult as Record<string, unknown>,
        });
      }

      // Send function responses back
      response = await withRetry(
        () =>
          chat.sendMessage({
            message: functionResponses.map((fr) => ({
              functionResponse: {
                id: fr.id,
                name: fr.name,
                response: fr.response,
              },
            })),
          }),
        { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
      );
    }

    // Extract text from final response
    const rawText = response.text ?? '';

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
      timestamp: new Date(),
    };
  }

  /**
   * Generate synthesis by calling Gemini API directly with synthesis-specific prompts
   * This bypasses the standard debate prompt building to use synthesis format
   */
  protected override async generateSynthesisInternal(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    const response = await withRetry(
      () =>
        this.ai.models.generateContent({
          model: this.model,
          contents: userMessage,
          config: {
            systemInstruction: systemPrompt,
            temperature: this.temperature,
            maxOutputTokens: this.maxTokens,
          },
        }),
      { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
    );

    return response.text ?? '';
  }

  /**
   * Generate a raw text completion without parsing into structured format
   * Used by AIConsensusAnalyzer to get raw JSON responses
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug({ agentId: this.id }, 'Generating raw completion');

    const response = await withRetry(
      () =>
        this.ai.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            systemInstruction:
              systemPrompt ?? 'You are a helpful AI assistant. Respond exactly as instructed.',
            temperature: this.temperature,
            maxOutputTokens: this.maxTokens,
          },
        }),
      { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
    );

    return response.text ?? '';
  }

  /**
   * Health check: Test Gemini API connection with minimal request
   */
  override async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const response = await withRetry(
        () =>
          this.ai.models.generateContent({
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
        { maxRetries: 3, retryableErrors: RETRYABLE_ERRORS }
      );
      // Check if we got a valid response
      if (response.text !== undefined) {
        return { healthy: true };
      }
      return { healthy: false, error: 'No response text' };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
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
