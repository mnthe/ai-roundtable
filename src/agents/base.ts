/**
 * Base Agent - Abstract class for all AI agents
 */

import { jsonrepair } from 'jsonrepair';
import { createLogger } from '../utils/logger.js';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  AIProvider,
  SynthesisContext,
  Citation,
  ToolCallRecord,
} from '../types/index.js';
import type { AgentToolkit } from '../tools/types.js';

// Re-export toolkit types for backwards compatibility
export type { AgentTool, AgentToolkit } from '../tools/types.js';

const logger = createLogger('BaseAgent');

/**
 * Tool result structure that may contain citations
 */
interface ToolResultWithCitations {
  success?: boolean;
  data?: {
    results?: Array<{ title: string; url: string; snippet?: string }>;
    citations?: Array<{ title: string; url: string; snippet?: string }>;
  };
}

/**
 * Result from provider-specific API call
 */
export interface ProviderApiResult {
  /** Raw text response from the API */
  rawText: string;
  /** Tool calls made during the API call */
  toolCalls: ToolCallRecord[];
  /** Citations extracted from tool results */
  citations: Citation[];
}

/**
 * submit_response tool output structure
 */
interface SubmitResponseOutput {
  success?: boolean;
  data?: {
    stance?: 'YES' | 'NO' | 'NEUTRAL';
    position?: string;
    reasoning?: string;
    confidence?: number;
  };
}

/**
 * Parsed output from agent response
 */
interface ParsedAgentOutput {
  position: string;
  reasoning: string;
  confidence: number;
  stance?: 'YES' | 'NO' | 'NEUTRAL';
}

/**
 * Parameters for building an AgentResponse
 */
interface AgentResponseParams {
  parsed: ParsedAgentOutput;
  rawText: string;
  citations: Citation[];
  toolCalls: ToolCallRecord[];
}

/**
 * Abstract base class for AI agents
 *
 * To add a new AI provider:
 * 1. Extend this class
 * 2. Implement generateResponse()
 * 3. Register in AgentRegistry
 */
export abstract class BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly provider: AIProvider;
  readonly model: string;

  protected readonly systemPrompt?: string;
  protected readonly temperature: number;
  protected readonly maxTokens: number;
  protected toolkit?: AgentToolkit;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.provider = config.provider;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 4096;
  }

  /**
   * Set the toolkit that provides common tools to the agent
   */
  setToolkit(toolkit: AgentToolkit): void {
    this.toolkit = toolkit;
  }

  /**
   * Execute a tool call using the toolkit
   * Provides common error handling for all agent implementations
   */
  protected async executeTool(name: string, input: unknown): Promise<unknown> {
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
   * Generate a response for the current debate context
   *
   * This is a template method that provides common logging, timing, and error handling.
   * Subclasses should implement callProviderApi() for provider-specific API calls.
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
      // Call provider-specific API implementation
      const apiResult = await this.callProviderApi(context);

      // Extract response from tool calls or text
      const parsed = this.extractResponseFromToolCallsOrText(
        apiResult.toolCalls,
        apiResult.rawText,
        context
      );

      // Build the final response
      const result = this.buildAgentResponse({
        parsed,
        rawText: apiResult.rawText,
        citations: apiResult.citations,
        toolCalls: apiResult.toolCalls,
      });

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          sessionId: context.sessionId,
          agentId: this.id,
          agentName: this.name,
          round: context.currentRound,
          durationMs,
          confidence: parsed.confidence,
          toolCallCount: apiResult.toolCalls.length,
          citationCount: apiResult.citations.length,
        },
        'Agent response generation completed'
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const convertedError = this.convertError(error);
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
   * Call the provider-specific API to generate a response
   *
   * Subclasses must implement this method to:
   * 1. Build provider-specific messages/prompts
   * 2. Make API calls with retry logic
   * 3. Handle tool use loops
   * 4. Return raw text, tool calls, and citations
   *
   * The common logging, timing, and error handling is done by generateResponse().
   */
  protected abstract callProviderApi(context: DebateContext): Promise<ProviderApiResult>;

  /**
   * Convert SDK-specific errors to standard error types
   *
   * Subclasses should override this to convert provider-specific SDK errors.
   * Default implementation returns the error as-is.
   */
  protected convertError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Generate a raw text completion without parsing into structured format
   *
   * This method is designed for use cases like AI consensus analysis where
   * the raw AI response (e.g., JSON) needs to be preserved without transformation.
   *
   * Must be implemented by each provider-specific agent.
   *
   * @param prompt - The prompt to send to the AI model
   * @param systemPrompt - Optional system prompt for context
   * @returns Raw text response from the AI model
   */
  abstract generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string>;

  /**
   * Health check: Test if the agent's API connection is working
   * Returns true if the agent is healthy, false otherwise
   *
   * This is a template method that provides common logging and error handling.
   * Subclasses should implement performHealthCheck() for provider-specific API calls.
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    logger.debug(
      { agentId: this.id, agentName: this.name, provider: this.provider },
      'Starting health check'
    );

    try {
      await this.performHealthCheck();
      logger.info(
        { agentId: this.id, agentName: this.name, provider: this.provider },
        'Health check passed'
      );
      return { healthy: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        { agentId: this.id, agentName: this.name, provider: this.provider, error: errorMessage },
        'Health check failed'
      );
      return {
        healthy: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Perform provider-specific health check
   *
   * Subclasses must implement this method to make a minimal API call
   * to verify connectivity. Should throw an error if the health check fails.
   */
  protected abstract performHealthCheck(): Promise<void>;

  /**
   * Generate a synthesis of debate responses
   *
   * Unlike generateResponse(), this method uses synthesis-specific prompts
   * that request JSON in synthesis format (commonGround, keyDifferences, etc.)
   * rather than debate format (position, reasoning, confidence).
   *
   * Default implementation calls generateSynthesisInternal which can be
   * overridden by provider-specific agents for direct API access.
   */
  async generateSynthesis(context: SynthesisContext): Promise<string> {
    const systemPrompt = this.buildSynthesisSystemPrompt();
    const userMessage = context.synthesisPrompt;

    // Call the internal method that subclasses can override for direct API access
    const response = await this.generateSynthesisInternal(systemPrompt, userMessage);
    return response;
  }

  /**
   * Internal method for generating synthesis
   *
   * This is a template method that provides common logging and error handling.
   * Subclasses should implement performSynthesis() for provider-specific API calls.
   *
   * @param systemPrompt - System prompt for synthesis
   * @param userMessage - User message containing the synthesis prompt
   * @returns Raw synthesis response text
   */
  protected async generateSynthesisInternal(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    logger.info({ agentId: this.id, agentName: this.name }, 'Starting synthesis generation');

    try {
      const result = await this.performSynthesis(systemPrompt, userMessage);
      logger.info({ agentId: this.id, agentName: this.name }, 'Synthesis generation completed');
      return result;
    } catch (error) {
      const convertedError = this.convertError(error);
      logger.error(
        { err: convertedError, agentId: this.id, agentName: this.name },
        'Failed to generate synthesis'
      );
      throw convertedError;
    }
  }

  /**
   * Perform provider-specific synthesis API call
   *
   * Default implementation calls generateRawCompletion with the synthesis prompts.
   * Subclasses can override this if they need different behavior for synthesis.
   *
   * @param systemPrompt - System prompt for synthesis
   * @param userMessage - User message containing the synthesis prompt
   * @returns Raw synthesis response text
   */
  protected async performSynthesis(systemPrompt: string, userMessage: string): Promise<string> {
    return this.generateRawCompletion(userMessage, systemPrompt);
  }

  /**
   * Build the system prompt for synthesis tasks
   */
  protected buildSynthesisSystemPrompt(): string {
    return `You are ${this.name}, an AI assistant tasked with synthesizing and analyzing debate discussions.
Your role is to provide a comprehensive, balanced synthesis of the debate.
You must respond with valid JSON only, no additional text before or after the JSON object.`;
  }

  /**
   * Build the system prompt for the debate
   */
  protected buildSystemPrompt(context: DebateContext): string {
    const basePrompt = this.systemPrompt ?? this.getDefaultSystemPrompt();
    const parts: string[] = [basePrompt];

    // Add mode-specific prompt if provided
    if (context.modePrompt) {
      parts.push(context.modePrompt);
    }

    parts.push(`Current debate topic: ${context.topic}
Debate mode: ${context.mode}
Round ${context.currentRound} of ${context.totalRounds}

${context.focusQuestion ? `Focus question: ${context.focusQuestion}` : ''}

Instructions:
- Provide your position clearly and concisely
- Support your position with logical reasoning
- Express your confidence level (0-1) in your position
- If you use any tools (web search, fact check), cite your sources`);

    return parts.join('\n\n');
  }

  /**
   * Get the default system prompt for this agent
   */
  protected getDefaultSystemPrompt(): string {
    return `You are ${this.name}, an AI participating in a structured roundtable discussion.
Your role is to provide thoughtful, well-reasoned perspectives on the topic at hand.
Be respectful of other participants' views while clearly articulating your own position.`;
  }

  /**
   * Build the user message from debate context
   */
  protected buildUserMessage(context: DebateContext): string {
    const parts: string[] = [];

    // Include provided context results if available (responses to previous context requests)
    if (context.contextResults && context.contextResults.length > 0) {
      parts.push('=== PROVIDED CONTEXT ===');
      parts.push(
        'The following information was provided in response to your previous context requests:\n'
      );
      for (const result of context.contextResults) {
        parts.push(`[Request ID: ${result.requestId}]`);
        if (result.success && result.result) {
          parts.push(result.result);
        } else if (result.error) {
          parts.push(`[Error: ${result.error}]`);
        }
        parts.push('');
      }
      parts.push('=== END PROVIDED CONTEXT ===\n');
    }

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
    }

    // Build JSON format instruction based on mode
    const stanceInstruction =
      context.mode === 'devils-advocate'
        ? `  "stance": "YES" or "NO" or "NEUTRAL" (REQUIRED - must match your assigned role),\n`
        : `  "stance": "YES" or "NO" or "NEUTRAL" (optional),\n`;

    parts.push(`
Please provide your response in the following JSON format:
{
${stanceInstruction}  "position": "Your clear position statement",
  "reasoning": "Your detailed reasoning and arguments",
  "confidence": 0.0 to 1.0
}
`);

    return parts.join('\n');
  }

  /**
   * Parse the raw response from the AI into structured format
   * Uses jsonrepair to handle malformed JSON from AI models
   */
  protected parseResponse(raw: string, _context: DebateContext): Partial<AgentResponse> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Use jsonrepair to fix common JSON issues (trailing commas, unquoted keys, etc.)
        const repairedJson = jsonrepair(jsonMatch[0]);
        const parsed = JSON.parse(repairedJson) as {
          stance?: string;
          position?: string;
          reasoning?: string;
          confidence?: number;
        };

        // Only use parsed JSON if it has expected debate response fields
        // Otherwise fall through to preserve raw text (important for key points extraction)
        if ('position' in parsed || 'reasoning' in parsed) {
          // Validate and normalize stance value
          const validStances = ['YES', 'NO', 'NEUTRAL'];
          const normalizedStance = parsed.stance?.toUpperCase();
          const stance =
            normalizedStance && validStances.includes(normalizedStance)
              ? (normalizedStance as 'YES' | 'NO' | 'NEUTRAL')
              : undefined;

          // Use || to catch empty strings (not just null/undefined)
          return {
            agentId: this.id,
            agentName: this.name,
            stance,
            position: parsed.position || 'Unable to determine position',
            reasoning: parsed.reasoning || 'Unable to determine reasoning',
            confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
            timestamp: new Date(),
          };
        }
        // JSON found but without expected fields - fall through to preserve raw JSON
      }
    } catch {
      // Fall through to fallback parsing
    }

    // Fallback: treat the entire response as position/reasoning
    // Use || to ensure we never return empty strings
    const trimmedRaw = raw.trim();
    return {
      agentId: this.id,
      agentName: this.name,
      position: trimmedRaw.slice(0, 200) || 'Unable to determine position',
      reasoning: trimmedRaw || 'Unable to determine reasoning',
      confidence: 0.5,
      timestamp: new Date(),
    };
  }

  /**
   * Extract citations from a tool result
   *
   * Handles two formats:
   * - search_web: { success: boolean, data: { results: [...] } }
   * - perplexity_search: { success: boolean, data: { citations: [...] } }
   *
   * @param toolName - Name of the tool that produced the result
   * @param result - The raw tool result
   * @returns Array of citations extracted from the result
   */
  protected extractCitationsFromToolResult(toolName: string, result: unknown): Citation[] {
    const citations: Citation[] = [];

    if (!result || typeof result !== 'object') {
      return citations;
    }

    const toolResult = result as ToolResultWithCitations;

    if (!toolResult.success || !toolResult.data) {
      return citations;
    }

    // Handle search_web format
    if (toolName === 'search_web' && toolResult.data.results) {
      for (const item of toolResult.data.results) {
        citations.push({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
        });
      }
    }
    // Handle perplexity_search format
    else if (toolName === 'perplexity_search' && toolResult.data.citations) {
      for (const item of toolResult.data.citations) {
        citations.push({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
        });
      }
    }

    return citations;
  }

  /**
   * Extract response data from tool calls or raw text
   *
   * First checks if submit_response tool was used successfully,
   * then falls back to parsing the raw text.
   *
   * @param toolCalls - Array of tool calls made by the agent
   * @param rawText - Raw text response from the agent
   * @param context - Debate context for parsing
   * @returns Parsed output with position, reasoning, and confidence
   */
  protected extractResponseFromToolCallsOrText(
    toolCalls: ToolCallRecord[],
    rawText: string,
    context: DebateContext
  ): ParsedAgentOutput {
    const submitResponseCall = toolCalls.find((tc) => tc.toolName === 'submit_response');

    if (submitResponseCall && submitResponseCall.output) {
      const toolOutput = submitResponseCall.output as SubmitResponseOutput;

      if (toolOutput.success && toolOutput.data) {
        return {
          position: toolOutput.data.position ?? 'Unable to determine position',
          reasoning: toolOutput.data.reasoning ?? 'Unable to determine reasoning',
          confidence: Math.min(1, Math.max(0, toolOutput.data.confidence ?? 0.5)),
          stance: toolOutput.data.stance,
        };
      }
    }

    // Fall back to parsing raw text
    const parsed = this.parseResponse(rawText, context);
    return {
      position: parsed.position || 'Unable to determine position',
      reasoning: parsed.reasoning || rawText || 'Unable to determine reasoning',
      confidence: parsed.confidence ?? 0.5,
      stance: parsed.stance,
    };
  }

  /**
   * Build an AgentResponse from parsed data and metadata
   *
   * @param params - Parameters containing parsed data and metadata
   * @returns Complete AgentResponse object
   */
  protected buildAgentResponse(params: AgentResponseParams): AgentResponse {
    const { parsed, rawText, citations, toolCalls } = params;

    // Validate response has content - use || to catch empty strings
    const position = parsed.position || 'Unable to determine position';
    const reasoning = parsed.reasoning || rawText || 'Unable to determine reasoning';

    return {
      agentId: this.id,
      agentName: this.name,
      stance: parsed.stance,
      position,
      reasoning,
      confidence: parsed.confidence,
      citations: citations.length > 0 ? citations : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: new Date(),
    };
  }

  /**
   * Get agent info for display/debugging
   */
  getInfo(): { id: string; name: string; provider: AIProvider; model: string } {
    return {
      id: this.id,
      name: this.name,
      provider: this.provider,
      model: this.model,
    };
  }
}

/**
 * Mock agent for testing purposes
 */
export class MockAgent extends BaseAgent {
  private mockResponse?: AgentResponse;
  private responseDelay: number;

  constructor(
    config: AgentConfig,
    options?: { mockResponse?: AgentResponse; responseDelay?: number }
  ) {
    super(config);
    this.mockResponse = options?.mockResponse;
    this.responseDelay = options?.responseDelay ?? 0;
  }

  setMockResponse(response: AgentResponse): void {
    this.mockResponse = response;
  }

  /**
   * Override generateResponse to bypass template method for testing
   * MockAgent needs full control over the response for test assertions
   */
  override async generateResponse(context: DebateContext): Promise<AgentResponse> {
    if (this.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelay));
    }

    if (this.mockResponse) {
      return {
        ...this.mockResponse,
        agentId: this.id,
        agentName: this.name,
      };
    }

    // Generate a default mock response
    return {
      agentId: this.id,
      agentName: this.name,
      position: `Mock position on "${context.topic}"`,
      reasoning: `This is a mock response for testing. Round ${context.currentRound}/${context.totalRounds}.`,
      confidence: 0.75,
      timestamp: new Date(),
    };
  }

  /**
   * Mock implementation of callProviderApi
   * Not used since generateResponse is overridden, but required by abstract class
   */
  protected override async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    return {
      rawText: `Mock response for ${context.topic}`,
      toolCalls: [],
      citations: [],
    };
  }

  async generateRawCompletion(prompt: string, _systemPrompt?: string): Promise<string> {
    if (this.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelay));
    }

    // Return a mock JSON response for testing
    return JSON.stringify({
      agreementLevel: 0.8,
      commonGround: ['Mock common point'],
      disagreementPoints: [],
      summary: `Mock analysis of: ${prompt.slice(0, 50)}...`,
    });
  }

  protected async performHealthCheck(): Promise<void> {
    // Mock agent is always healthy
    if (this.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelay));
    }
  }
}
