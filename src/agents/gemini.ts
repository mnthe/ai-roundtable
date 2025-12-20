/**
 * Gemini Agent - Google Gemini implementation using the new @google/genai SDK
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { Chat, FunctionDeclaration, Content } from '@google/genai';
import { BaseAgent, type AgentToolkit } from './base.js';
import { withRetry } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';
import { convertSDKError } from './utils/error-converter.js';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  ToolCallRecord,
  Citation,
} from '../types/index.js';

const logger = createLogger('GeminiAgent');

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
  private client: GoogleGenAI;

  constructor(config: AgentConfig, options?: GeminiAgentOptions) {
    super(config);

    const apiKey = options?.apiKey ?? process.env.GOOGLE_API_KEY ?? '';

    if (options?.client) {
      this.client = options.client;
    } else {
      this.client = new GoogleGenAI({ apiKey });
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

    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const userMessage = this.buildUserMessage(context);

      const toolCalls: ToolCallRecord[] = [];
      const citations: Citation[] = [];

      // Build tools if toolkit is available
      const tools = this.toolkit ? this.buildGeminiTools() : undefined;

      // Build chat history
      const history: Content[] = [];

      // Create chat session with system instruction in config
      const chat: Chat = this.client.chats.create({
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
      let response = await withRetry(() => chat.sendMessage({ message: userMessage }), {
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

          // Extract citations from search results
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
            chat.sendMessage({
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

      // Extract text from final response
      const rawText = response.text ?? '';

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
          toolCallCount: toolCalls.length,
          citationCount: citations.length,
          confidence: parsed.confidence,
        },
        'Agent response generation completed'
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const convertedError = convertSDKError(error, 'google');
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
   * Generate synthesis by calling Gemini API directly with synthesis-specific prompts
   * This bypasses the standard debate prompt building to use synthesis format
   */
  protected override async generateSynthesisInternal(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    try {
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
    } catch (error) {
      throw convertSDKError(error, 'google');
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
      throw convertSDKError(error, 'google');
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
