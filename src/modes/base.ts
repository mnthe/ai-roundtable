/**
 * Base Debate Mode Strategy
 */

import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BaseModeStrategy');

/**
 * Strategy interface for different debate modes
 *
 * Each mode defines how agents interact during a debate round:
 * - Collaborative: Agents work together to find common ground
 * - Adversarial: Agents challenge each other's positions
 * - Socratic: Question-driven inquiry and critical thinking
 * - Expert Panel: Agents provide expert opinions in turn
 */
export interface DebateModeStrategy {
  /**
   * Name of the debate mode
   */
  readonly name: string;

  /**
   * Whether this mode needs groupthink detection during consensus analysis
   *
   * Modes where agents are expected to agree (collaborative, delphi) benefit from
   * groupthink detection. Modes with built-in opposition (adversarial, devils-advocate)
   * typically don't need it as disagreement is structurally enforced.
   *
   * Default: true (for backward compatibility)
   */
  readonly needsGroupthinkDetection?: boolean;

  /**
   * Execute a debate round with the given agents
   *
   * @param agents - Array of agents participating in this round
   * @param context - Current debate context
   * @param toolkit - Toolkit providing tools to agents
   * @returns Array of responses from all agents
   */
  executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]>;

  /**
   * Build mode-specific prompt additions for agents
   *
   * This allows each mode to customize how agents should behave
   * during the debate (e.g., collaborative vs adversarial)
   *
   * @param context - Current debate context
   * @returns Additional prompt text for this mode
   */
  buildAgentPrompt(context: DebateContext): string;
}

/**
 * Abstract base class for debate mode strategies
 *
 * Provides common execution patterns:
 * - executeParallel: All agents respond simultaneously (see only previous rounds)
 * - executeSequential: Agents respond one by one (see accumulated current round responses)
 *
 * Optional hooks for customization:
 * - transformContext: Transform context before passing to agent (e.g., anonymization)
 * - validateResponse: Validate and potentially modify response after generation
 * - getAgentRole: Get role identifier for an agent (e.g., PRIMARY/OPPOSITION/EVALUATOR)
 */
export abstract class BaseModeStrategy implements DebateModeStrategy {
  abstract readonly name: string;

  /** Execution pattern for this mode (for optimization guidance) */
  readonly executionPattern?: 'parallel' | 'sequential';

  abstract executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]>;

  abstract buildAgentPrompt(context: DebateContext): string;

  // ============================================
  // Optional Hooks for Mode Customization
  // ============================================

  /**
   * Transform context before passing to agent.
   * Use case: Delphi anonymization, statistics injection
   *
   * @param context - Current debate context
   * @param agent - The agent that will receive the context
   * @returns Transformed context
   */
  protected transformContext?(context: DebateContext, agent: BaseAgent): DebateContext;

  /**
   * Validate and potentially modify response after generation.
   * Use case: Devils-advocate stance enforcement
   *
   * @param response - The agent's response
   * @param context - The debate context used for generation
   * @returns Validated/modified response
   */
  protected validateResponse?(response: AgentResponse, context: DebateContext): AgentResponse;

  /**
   * Get role identifier for an agent.
   * Use case: Devils-advocate PRIMARY/OPPOSITION/EVALUATOR
   *
   * @param agent - The agent
   * @param index - The agent's index in the agents array
   * @param context - Current debate context
   * @returns Role identifier or undefined
   */
  protected getAgentRole?(
    agent: BaseAgent,
    index: number,
    context: DebateContext
  ): string | undefined;

  // ============================================
  // Core Execution Methods
  // ============================================

  /**
   * Execute all agents in parallel
   *
   * All agents respond simultaneously, seeing only previous rounds' responses.
   * Best for: Collaborative, Expert Panel, Delphi modes
   *
   * Handles individual agent errors gracefully - continues with other agents.
   * Calls optional hooks if defined:
   * - transformContext: Before passing context to each agent
   * - validateResponse: After receiving response from each agent
   *
   * @param agents - Array of agents to execute
   * @param context - Current debate context
   * @param toolkit - Toolkit providing tools to agents
   * @returns Array of responses from all agents (excluding failed ones)
   */
  protected async executeParallel(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    // Build base context with mode-specific prompt
    const baseContext: DebateContext = {
      ...context,
      modePrompt: this.buildAgentPrompt(context),
    };

    // Execute all agents in parallel with error handling
    const responsePromises = agents.map((agent) => {
      agent.setToolkit(toolkit);

      // Apply transformContext hook if defined
      const agentContext = this.transformContext
        ? this.transformContext(baseContext, agent)
        : baseContext;

      return agent.generateResponse(agentContext);
    });

    // Use allSettled to handle individual failures gracefully
    const results = await Promise.allSettled(responsePromises);

    const responses: AgentResponse[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const agent = agents[i];
      if (!result || !agent) continue;

      if (result.status === 'fulfilled') {
        // Apply validateResponse hook if defined
        const response = this.validateResponse
          ? this.validateResponse(result.value, baseContext)
          : result.value;
        responses.push(response);
      } else {
        // Log error but continue with other agents
        logger.error({ err: result.reason, agentId: agent.id }, 'Error from agent');
      }
    }

    return responses;
  }

  /**
   * Execute agents sequentially
   *
   * Agents respond one by one, each seeing accumulated responses from the current round.
   * Best for: Adversarial, Socratic modes
   *
   * Handles individual agent errors gracefully - continues with other agents.
   * Calls optional hooks if defined:
   * - getAgentRole: To get role identifier for logging
   * - transformContext: Before passing context to each agent
   * - validateResponse: After receiving response from each agent
   *
   * @param agents - Array of agents to execute
   * @param context - Current debate context
   * @param toolkit - Toolkit providing tools to agents
   * @returns Array of responses from all agents (excluding failed ones)
   */
  protected async executeSequential(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    const responses: AgentResponse[] = [];

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (!agent) continue;

      try {
        // Get agent role if hook is defined (for logging)
        const role = this.getAgentRole?.(agent, i, context);
        if (role) {
          logger.debug({ agentId: agent.id, role, index: i }, 'Agent role assigned');
        }

        // Build context with accumulated responses from current round
        const baseContext: DebateContext = {
          ...context,
          previousResponses: [...context.previousResponses, ...responses],
          modePrompt: this.buildAgentPrompt({
            ...context,
            previousResponses: [...context.previousResponses, ...responses],
          }),
        };

        // Apply transformContext hook if defined
        const agentContext = this.transformContext
          ? this.transformContext(baseContext, agent)
          : baseContext;

        agent.setToolkit(toolkit);
        let response = await agent.generateResponse(agentContext);

        // Apply validateResponse hook if defined
        if (this.validateResponse) {
          response = this.validateResponse(response, baseContext);
        }

        responses.push(response);
      } catch (error) {
        // Log error but continue with other agents
        logger.error({ err: error, agentId: agent.id }, 'Error from agent');
      }
    }

    return responses;
  }
}
