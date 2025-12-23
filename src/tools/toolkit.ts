/**
 * Agent Toolkit - Common tools available to all agents during debates
 */

import type { AgentTool, AgentToolkit, ToolDefinition } from './types.js';
import type {
  DebateContext,
  ToolResult,
  ContextRequest,
  ContextRequestPriority,
} from '../types/index.js';
import { validateToolInput, type FactCheckInput, type RequestContextInput } from './schemas.js';

/**
 * Interface for retrieving debate evidence from sessions
 */
export interface SessionDataProvider {
  /**
   * Get all evidence from a debate session for fact checking
   * Returns all agent responses - AI will determine relevance to the claim
   *
   * @param sessionId - The session ID to retrieve evidence from
   * @returns Array of evidence from all agents in the session
   */
  getDebateEvidence(sessionId: string): Promise<
    Array<{
      agentId: string;
      agentName: string;
      position: string;
      reasoning: string;
      confidence: number;
    }>
  >;
}

/**
 * Default toolkit implementation
 *
 * Provides:
 * - fact_check: Verify claims with debate evidence
 * - request_context: Request additional context from caller (SOTA AI)
 *
 * Note: Web search is handled by each AI provider's native capabilities
 * (Claude: web_search, ChatGPT: web_search, Gemini: google_search grounding, Perplexity: built-in)
 *
 * Note: get_context and submit_response were removed as redundant:
 * - Context is already included in the system prompt via buildSystemPrompt() and buildUserMessage()
 * - Response parsing is handled by BaseAgent.extractResponseFromToolCallsOrText()
 */
export class DefaultAgentToolkit implements AgentToolkit {
  private tools: Map<string, ToolDefinition> = new Map();
  private currentContext?: DebateContext;
  private pendingContextRequests: ContextRequest[] = [];
  private currentAgentId: string = 'unknown';
  private requestIdCounter = 0;

  constructor(private sessionDataProvider?: SessionDataProvider) {
    this.registerDefaultTools();
  }

  /**
   * Set the current debate context (called by DebateEngine before agent turn)
   */
  setContext(context: DebateContext): void {
    this.currentContext = context;
  }

  /**
   * Set the current agent ID (called by mode strategy before agent turn)
   *
   * @deprecated Use agentId parameter in executeTool instead.
   * This method has race conditions in parallel execution where multiple
   * agents call setCurrentAgentId concurrently, causing the last call to
   * overwrite all previous values.
   */
  setCurrentAgentId(agentId: string): void {
    this.currentAgentId = agentId;
  }

  /**
   * Get pending context requests collected during this round
   */
  getPendingContextRequests(): ContextRequest[] {
    return [...this.pendingContextRequests];
  }

  /**
   * Clear pending context requests (called at the start of each round)
   */
  clearPendingRequests(): void {
    this.pendingContextRequests = [];
  }

  /**
   * Check if there are any pending context requests
   */
  hasPendingRequests(): boolean {
    return this.pendingContextRequests.length > 0;
  }

  /**
   * Generate a unique ID for context requests
   */
  private generateRequestId(): string {
    this.requestIdCounter++;
    return `ctx-${Date.now()}-${this.requestIdCounter}`;
  }

  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    // Tool 1: Fact Check
    this.registerTool({
      tool: {
        name: 'fact_check',
        description:
          'Check claims against evidence from the current debate. ' +
          'Returns all positions and reasoning from other participants. ' +
          'Use this to verify claims made by other agents.',
        parameters: {
          claim: {
            type: 'string',
            description: 'The claim to verify',
          },
          source_agent: {
            type: 'string',
            description: 'Agent who made the claim (will be excluded from results)',
          },
        },
      },
      executor: async (input) => this.executeFactCheck(input),
    });

    // Tool 2: Request Context (External Context Integration)
    // Note: This tool is handled specially in executeTool() to pass agentId
    this.registerTool({
      tool: {
        name: 'request_context',
        description:
          'Request additional context or information from the caller (an AI agent like Claude Code). ' +
          'Describe WHAT you need in natural language - the caller will determine HOW to obtain it.\n\n' +
          'Examples:\n' +
          '- "src/auth.ts 파일의 내용을 읽어주세요"\n' +
          '- "authenticate 함수를 호출하는 코드를 찾아주세요"\n' +
          '- "이 프로젝트의 테스트 커버리지를 확인해주세요"\n\n' +
          'Do NOT specify tool names or technical details - just describe what you need. ' +
          'The result will be available in the next round.',
        parameters: {
          query: {
            type: 'string',
            description: 'What information do you need? (natural language)',
          },
          reason: {
            type: 'string',
            description: 'Why do you need this information?',
          },
          priority: {
            type: 'string',
            description:
              '"required" if debate cannot continue without it, "optional" if helpful but not essential. Default: "required"',
          },
        },
      },
      // Executor is bypassed - executeTool() handles request_context specially
      // to pass agentId for proper tracking in parallel execution
      executor: async () => {
        throw new Error('request_context should be handled specially in executeTool()');
      },
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
   *
   * Input is validated against the tool's Zod schema before execution.
   * Returns an error result if validation fails.
   *
   * @param name - Tool name
   * @param input - Tool input
   * @param agentId - ID of the agent making the call (for request_context tracking).
   *                  Falls back to currentAgentId for backwards compatibility.
   */
  async executeTool(name: string, input: unknown, agentId?: string): Promise<unknown> {
    const definition = this.tools.get(name);
    if (!definition) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
      };
    }

    // Validate input against schema
    const validation = validateToolInput(name, input);
    if (validation.success === false) {
      return {
        success: false,
        error: validation.error,
      };
    }

    try {
      // For request_context, use provided agentId or fall back to currentAgentId
      if (name === 'request_context') {
        const effectiveAgentId = agentId ?? this.currentAgentId;
        return await this.executeRequestContext(validation.data, effectiveAgentId);
      }

      const result = await definition.executor(validation.data);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  }

  /**
   * Execute fact_check tool
   *
   * Returns all debate evidence from other participants for the AI to evaluate
   * relevance to the claim being checked.
   *
   * Note: Input is pre-validated by Zod schema in executeTool()
   */
  private async executeFactCheck(input: unknown): Promise<
    ToolResult<{
      claim: string;
      sourceAgent: string;
      debateEvidence: Array<{
        agentId: string;
        agentName: string;
        position: string;
        reasoning: string;
        confidence: number;
      }>;
    }>
  > {
    // Input is already validated by Zod schema
    const data = input as FactCheckInput;

    if (!this.sessionDataProvider || !this.currentContext) {
      return {
        success: false,
        error: 'Session context not available for fact checking',
      };
    }

    // Get all evidence from the session via interface
    const allEvidence = await this.sessionDataProvider.getDebateEvidence(
      this.currentContext.sessionId
    );

    // Exclude the source agent's own evidence
    const debateEvidence = allEvidence.filter(
      (e) => e.agentId !== data.source_agent && e.agentName !== data.source_agent
    );

    return {
      success: true,
      data: {
        claim: data.claim,
        sourceAgent: data.source_agent,
        debateEvidence,
      },
    };
  }

  /**
   * Execute request_context tool
   *
   * Queues a context request for the caller to fulfill.
   * The result will be available in the next round.
   *
   * Note: Input is pre-validated by Zod schema in executeTool()
   *
   * @param input - Validated input from Zod schema
   * @param agentId - ID of the agent making the request
   */
  private async executeRequestContext(
    input: unknown,
    agentId: string
  ): Promise<
    ToolResult<{
      requestId: string;
      message: string;
    }>
  > {
    // Input is already validated by Zod schema
    const data = input as RequestContextInput;

    // Create the context request
    const request: ContextRequest = {
      id: this.generateRequestId(),
      agentId: agentId,
      query: data.query,
      reason: data.reason,
      // Safe cast: priority is validated by RequestContextInputSchema as 'required' | 'optional'
      priority: data.priority as ContextRequestPriority,
      timestamp: new Date(),
    };

    // Add to pending requests
    this.pendingContextRequests.push(request);

    return {
      success: true,
      data: {
        requestId: request.id,
        message: 'Context request queued. The result will be available in the next round.',
      },
    };
  }
}

/**
 * Create a default toolkit with optional session data provider
 */
export function createDefaultToolkit(
  sessionDataProvider?: SessionDataProvider
): DefaultAgentToolkit {
  return new DefaultAgentToolkit(sessionDataProvider);
}
