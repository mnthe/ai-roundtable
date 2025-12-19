/**
 * Base Agent - Abstract class for all AI agents
 */

import { jsonrepair } from 'jsonrepair';
import type {
  AgentConfig,
  AgentResponse,
  DebateContext,
  AIProvider,
} from '../types/index.js';

/**
 * Tool definition that agents can use during debates
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Toolkit interface that provides common tools to agents
 */
export interface AgentToolkit {
  getTools(): AgentTool[];
  executeTool(name: string, input: unknown): Promise<unknown>;
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
   * Generate a response for the current debate context
   * Must be implemented by each provider-specific agent
   */
  abstract generateResponse(context: DebateContext): Promise<AgentResponse>;

  /**
   * Health check: Test if the agent's API connection is working
   * Returns true if the agent is healthy, false otherwise
   *
   * Default implementation attempts a simple API call with minimal tokens.
   * Override if provider requires specific health check logic.
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      // Create a minimal test context
      const testContext: DebateContext = {
        sessionId: 'health-check',
        topic: 'test',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 1,
        previousResponses: [],
      };

      // Attempt to generate a response with minimal input
      await this.generateResponse(testContext);
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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

    parts.push(`
Please provide your response in the following JSON format:
{
  "position": "Your clear position statement",
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
          position?: string;
          reasoning?: string;
          confidence?: number;
        };
        // Use || to catch empty strings (not just null/undefined)
        return {
          agentId: this.id,
          agentName: this.name,
          position: parsed.position || 'Unable to determine position',
          reasoning: parsed.reasoning || 'Unable to determine reasoning',
          confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
          timestamp: new Date(),
        };
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

  async generateResponse(context: DebateContext): Promise<AgentResponse> {
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
}
