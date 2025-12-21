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
  // Flag-Aware Execution Helper
  // ============================================

  /**
   * Execute with flag-aware pattern selection
   *
   * Uses context.flags.sequentialParallelization to determine execution pattern:
   * - 'none': Use the mode's default execution (falls back to defaultPattern)
   * - 'last-only': Use executeLastOnly (parallelizes all but last agent)
   * - 'full': Use executeParallel (all agents in parallel)
   *
   * @param agents - Array of agents to execute
   * @param context - Current debate context (with flags)
   * @param toolkit - Toolkit providing tools to agents
   * @param defaultPattern - Pattern to use when flags are not set ('parallel' or 'sequential')
   * @returns Array of responses from all agents
   */
  protected async executeWithFlags(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit,
    defaultPattern: 'parallel' | 'sequential'
  ): Promise<AgentResponse[]> {
    const flags = context.flags?.sequentialParallelization;

    // If parallelization is disabled or not configured, use default
    if (!flags?.enabled) {
      return defaultPattern === 'parallel'
        ? this.executeParallel(agents, context, toolkit)
        : this.executeSequential(agents, context, toolkit);
    }

    // Select execution based on parallelization level
    switch (flags.level) {
      case 'full':
        logger.debug({ mode: this.name }, 'Using full parallelization (flag override)');
        return this.executeParallel(agents, context, toolkit);

      case 'last-only':
        logger.debug({ mode: this.name }, 'Using last-only parallelization (flag override)');
        return this.executeLastOnly(agents, context, toolkit);

      case 'none':
      default:
        // Use mode's default pattern
        return defaultPattern === 'parallel'
          ? this.executeParallel(agents, context, toolkit)
          : this.executeSequential(agents, context, toolkit);
    }
  }

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
   * Execute all agents except last in parallel, then last agent sequentially
   *
   * "Last-only" pattern optimizes sequential modes where:
   * - Most agents can respond simultaneously (see only previous rounds)
   * - Last agent needs to see all current round responses
   *
   * Best for: Devils-advocate (evaluator sees all), expert-panel with synthesis
   * Expected ~60% latency reduction compared to full sequential execution.
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
  protected async executeLastOnly(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Fallback to sequential for 0-1 agents
    if (agents.length <= 1) {
      return this.executeSequential(agents, context, toolkit);
    }

    const lastAgent = agents[agents.length - 1];
    const otherAgents = agents.slice(0, -1);

    // Build base context with mode-specific prompt
    const baseContext: DebateContext = {
      ...context,
      modePrompt: this.buildAgentPrompt(context),
    };

    // Execute all agents except last in parallel
    // They see only previous round responses (not current round)
    const parallelPromises = otherAgents.map((agent, index) => {
      agent.setToolkit(toolkit);

      // Get agent role if hook is defined (for logging)
      const role = this.getAgentRole?.(agent, index, context);
      if (role) {
        logger.debug({ agentId: agent.id, role, index }, 'Agent role assigned (parallel)');
      }

      // Apply transformContext hook if defined
      const agentContext = this.transformContext
        ? this.transformContext(baseContext, agent)
        : baseContext;

      return agent.generateResponse(agentContext);
    });

    // Use allSettled to handle individual failures gracefully
    const parallelResults = await Promise.allSettled(parallelPromises);

    const parallelResponses: AgentResponse[] = [];
    for (let i = 0; i < parallelResults.length; i++) {
      const result = parallelResults[i];
      const agent = otherAgents[i];
      if (!result || !agent) continue;

      if (result.status === 'fulfilled') {
        // Apply validateResponse hook if defined
        const response = this.validateResponse
          ? this.validateResponse(result.value, baseContext)
          : result.value;
        parallelResponses.push(response);
      } else {
        // Log error but continue with other agents
        logger.error({ err: result.reason, agentId: agent.id }, 'Error from agent (parallel phase)');
      }
    }

    // Now execute last agent with access to all parallel responses
    if (!lastAgent) {
      return parallelResponses;
    }

    try {
      const lastIndex = agents.length - 1;
      const role = this.getAgentRole?.(lastAgent, lastIndex, context);
      if (role) {
        logger.debug({ agentId: lastAgent.id, role, index: lastIndex }, 'Agent role assigned (last)');
      }

      // Last agent sees all parallel responses from current round
      const lastContext: DebateContext = {
        ...context,
        previousResponses: [...context.previousResponses, ...parallelResponses],
        modePrompt: this.buildAgentPrompt({
          ...context,
          previousResponses: [...context.previousResponses, ...parallelResponses],
        }),
      };

      // Apply transformContext hook if defined
      const agentContext = this.transformContext
        ? this.transformContext(lastContext, lastAgent)
        : lastContext;

      lastAgent.setToolkit(toolkit);
      let response = await lastAgent.generateResponse(agentContext);

      // Apply validateResponse hook if defined
      if (this.validateResponse) {
        response = this.validateResponse(response, lastContext);
      }

      return [...parallelResponses, response];
    } catch (error) {
      // Log error but return parallel responses
      logger.error({ err: error, agentId: lastAgent.id }, 'Error from last agent');
      return parallelResponses;
    }
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
