/**
 * Gemini Agent - Google Gemini implementation
 */

import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerativeModel,
  type Content,
  type FunctionDeclaration,
} from '@google/generative-ai';
import { BaseAgent, type AgentToolkit } from './base.js';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  ToolCallRecord,
  Citation,
} from '../types/index.js';

/**
 * Configuration options for Gemini Agent
 */
export interface GeminiAgentOptions {
  /** Google AI API key (defaults to GOOGLE_API_KEY env var) */
  apiKey?: string;
  /** Custom GenerativeModel instance (for testing) */
  model?: GenerativeModel;
}

/**
 * Gemini Agent using Google's Generative AI API
 *
 * Supports:
 * - Function calling (tools)
 * - Structured response parsing
 * - Citation tracking from tool calls
 */
export class GeminiAgent extends BaseAgent {
  private genAI: GoogleGenerativeAI;
  private genModel: GenerativeModel;

  constructor(config: AgentConfig, options?: GeminiAgentOptions) {
    super(config);

    const apiKey = options?.apiKey ?? process.env.GOOGLE_API_KEY ?? '';

    if (options?.model) {
      this.genModel = options.model;
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.genModel = this.genAI.getGenerativeModel({
        model: this.model,
        generationConfig: {
          maxOutputTokens: this.maxTokens,
          temperature: this.temperature,
        },
      });
    }
  }

  /**
   * Generate a response using Gemini API
   */
  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // Build tools if toolkit is available
    const tools = this.toolkit ? this.buildGeminiTools() : undefined;

    // Build chat history
    const history: Content[] = [];

    // Create chat session with system instruction
    const chat = this.genModel.startChat({
      history,
      systemInstruction: systemPrompt,
      tools: tools ? [{ functionDeclarations: tools }] : undefined,
    });

    // Send message
    let result = await chat.sendMessage(userMessage);
    let response = result.response;

    // Handle function calling loop
    while (response.functionCalls() && response.functionCalls()!.length > 0) {
      const functionCalls = response.functionCalls()!;
      const functionResponses: Array<{ name: string; response: unknown }> = [];

      for (const functionCall of functionCalls) {
        const toolResult = await this.executeTool(functionCall.name, functionCall.args);

        toolCalls.push({
          toolName: functionCall.name,
          input: functionCall.args,
          output: toolResult,
          timestamp: new Date(),
        });

        // Extract citations from search results
        if (functionCall.name === 'search_web' && toolResult && typeof toolResult === 'object') {
          const searchResult = toolResult as { results?: Array<{ title: string; url: string; snippet?: string }> };
          if (searchResult.results) {
            for (const item of searchResult.results) {
              citations.push({
                title: item.title,
                url: item.url,
                snippet: item.snippet,
              });
            }
          }
        }

        functionResponses.push({
          name: functionCall.name,
          response: toolResult,
        });
      }

      // Send function responses back
      result = await chat.sendMessage(
        functionResponses.map((fr) => ({
          functionResponse: {
            name: fr.name,
            response: fr.response as object,
          },
        }))
      );
      response = result.response;
    }

    // Extract text from final response
    const rawText = response.text();

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
      timestamp: new Date(),
    };
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
   * Build Gemini-format tool definitions from toolkit
   */
  private buildGeminiTools(): FunctionDeclaration[] {
    if (!this.toolkit) {
      return [];
    }

    return this.toolkit.getTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, value]) => [
            key,
            {
              type: SchemaType.STRING,
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
