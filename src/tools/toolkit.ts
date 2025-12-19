/**
 * Agent Toolkit - Common tools available to all agents during debates
 */

import type { AgentTool, AgentToolkit } from '../agents/base.js';
import type {
  DebateContext,
  AgentResponse,
  SearchResult,
  SearchOptions,
  ToolResult,
} from '../types/index.js';

/**
 * Tool executor function type
 */
export type ToolExecutor = (input: unknown) => Promise<unknown>;

/**
 * Tool definition with executor
 */
export interface ToolDefinition {
  tool: AgentTool;
  executor: ToolExecutor;
}

/**
 * Interface for web search provider
 */
export interface WebSearchProvider {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

/**
 * Interface for session data provider (to get context)
 */
export interface SessionDataProvider {
  getSession(sessionId: string): Promise<{
    topic: string;
    mode: string;
    currentRound: number;
    responses: AgentResponse[];
    consensusPoints?: string[];
  } | null>;
  findRelatedEvidence(claim: string): Promise<Array<{
    agentName: string;
    evidence: string;
    confidence: number;
  }>>;
}

/**
 * Default toolkit implementation
 *
 * Provides:
 * - get_context: Get current debate context
 * - submit_response: Submit structured response (validation)
 * - search_web: Search the web for information
 * - fact_check: Request fact checking on a claim
 */
export class DefaultAgentToolkit implements AgentToolkit {
  private tools: Map<string, ToolDefinition> = new Map();
  private currentContext?: DebateContext;

  constructor(
    private webSearchProvider?: WebSearchProvider,
    private sessionDataProvider?: SessionDataProvider
  ) {
    this.registerDefaultTools();
  }

  /**
   * Set the current debate context (called by DebateEngine before agent turn)
   */
  setContext(context: DebateContext): void {
    this.currentContext = context;
  }

  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    // Tool 1: Get Context
    this.registerTool({
      tool: {
        name: 'get_context',
        description:
          'Get the current debate context including topic, round number, and previous responses from other participants.',
        parameters: {},
      },
      executor: async () => this.executeGetContext(),
    });

    // Tool 2: Submit Response
    this.registerTool({
      tool: {
        name: 'submit_response',
        description:
          'Submit your structured response with position, reasoning, and confidence level.',
        parameters: {
          position: {
            type: 'string',
            description: 'Your clear position statement on the topic',
          },
          reasoning: {
            type: 'string',
            description: 'Your detailed reasoning and arguments',
          },
          confidence: {
            type: 'number',
            description: 'Your confidence level from 0.0 to 1.0',
          },
        },
      },
      executor: async (input) => this.executeSubmitResponse(input),
    });

    // Tool 3: Search Web
    this.registerTool({
      tool: {
        name: 'search_web',
        description:
          'Search the web for relevant information to support your arguments. Returns titles, URLs, and snippets.',
        parameters: {
          query: {
            type: 'string',
            description: 'The search query',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results (default: 5, max: 10)',
          },
        },
      },
      executor: async (input) => this.executeSearchWeb(input),
    });

    // Tool 4: Fact Check
    this.registerTool({
      tool: {
        name: 'fact_check',
        description:
          'Request fact checking on a specific claim made by another participant. Returns supporting/contradicting evidence.',
        parameters: {
          claim: {
            type: 'string',
            description: 'The claim to fact check',
          },
          source_agent: {
            type: 'string',
            description: 'The name/ID of the agent who made the claim',
          },
        },
      },
      executor: async (input) => this.executeFactCheck(input),
    });
  }

  /**
   * Register a custom tool
   */
  registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.tool.name, definition);
  }

  /**
   * Get all registered tools
   */
  getTools(): AgentTool[] {
    return Array.from(this.tools.values()).map((def) => def.tool);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, input: unknown): Promise<unknown> {
    const definition = this.tools.get(name);
    if (!definition) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
      };
    }

    try {
      const result = await definition.executor(input);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  }

  /**
   * Execute get_context tool
   */
  private async executeGetContext(): Promise<ToolResult<{
    topic: string;
    mode: string;
    currentRound: number;
    totalRounds: number;
    previousResponses: Array<{
      agentName: string;
      position: string;
      confidence: number;
    }>;
    focusQuestion?: string;
  }>> {
    if (!this.currentContext) {
      return {
        success: false,
        error: 'No debate context available',
      };
    }

    return {
      success: true,
      data: {
        topic: this.currentContext.topic,
        mode: this.currentContext.mode,
        currentRound: this.currentContext.currentRound,
        totalRounds: this.currentContext.totalRounds,
        previousResponses: this.currentContext.previousResponses.map((r) => ({
          agentName: r.agentName,
          position: r.position,
          confidence: r.confidence,
        })),
        focusQuestion: this.currentContext.focusQuestion,
      },
    };
  }

  /**
   * Execute submit_response tool (validation only)
   */
  private async executeSubmitResponse(input: unknown): Promise<ToolResult<{
    position: string;
    reasoning: string;
    confidence: number;
  }>> {
    const data = input as {
      position?: string;
      reasoning?: string;
      confidence?: number;
    };

    if (!data.position || typeof data.position !== 'string') {
      return {
        success: false,
        error: 'Position is required and must be a string',
      };
    }

    if (!data.reasoning || typeof data.reasoning !== 'string') {
      return {
        success: false,
        error: 'Reasoning is required and must be a string',
      };
    }

    const rawConfidence = data.confidence ?? 0.5;
    if (typeof rawConfidence !== 'number') {
      return {
        success: false,
        error: 'Confidence must be a number between 0 and 1',
      };
    }

    // Clamp confidence to valid range
    const confidence = Math.min(1, Math.max(0, rawConfidence));

    return {
      success: true,
      data: {
        position: data.position,
        reasoning: data.reasoning,
        confidence,
      },
    };
  }

  /**
   * Execute search_web tool
   */
  private async executeSearchWeb(input: unknown): Promise<ToolResult<{
    results: SearchResult[];
  }>> {
    if (!this.webSearchProvider) {
      return {
        success: false,
        error: 'Web search is not available',
      };
    }

    const data = input as {
      query?: string;
      max_results?: number;
    };

    if (!data.query || typeof data.query !== 'string') {
      return {
        success: false,
        error: 'Query is required',
      };
    }

    const maxResults = Math.min(10, data.max_results ?? 5);

    try {
      const results = await this.webSearchProvider.search(data.query, {
        maxResults,
      });

      return {
        success: true,
        data: { results },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  }

  /**
   * Execute fact_check tool
   */
  private async executeFactCheck(input: unknown): Promise<ToolResult<{
    claim: string;
    sourceAgent: string;
    webEvidence: SearchResult[];
    debateEvidence: Array<{
      agentName: string;
      evidence: string;
      confidence: number;
    }>;
  }>> {
    const data = input as {
      claim?: string;
      source_agent?: string;
    };

    if (!data.claim || typeof data.claim !== 'string') {
      return {
        success: false,
        error: 'Claim is required',
      };
    }

    const sourceAgent = data.source_agent ?? 'unknown';

    // Get web evidence if search provider is available
    let webEvidence: SearchResult[] = [];
    if (this.webSearchProvider) {
      try {
        webEvidence = await this.webSearchProvider.search(
          `fact check: ${data.claim}`,
          { maxResults: 3 }
        );
      } catch {
        // Ignore search errors for fact check
      }
    }

    // Get debate evidence if session provider is available
    let debateEvidence: Array<{
      agentName: string;
      evidence: string;
      confidence: number;
    }> = [];
    if (this.sessionDataProvider) {
      try {
        debateEvidence = await this.sessionDataProvider.findRelatedEvidence(data.claim);
      } catch {
        // Ignore session errors
      }
    }

    return {
      success: true,
      data: {
        claim: data.claim,
        sourceAgent,
        webEvidence,
        debateEvidence,
      },
    };
  }
}

/**
 * Create a default toolkit with optional providers
 */
export function createDefaultToolkit(
  webSearchProvider?: WebSearchProvider,
  sessionDataProvider?: SessionDataProvider
): DefaultAgentToolkit {
  return new DefaultAgentToolkit(webSearchProvider, sessionDataProvider);
}
