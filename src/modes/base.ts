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
 */
export abstract class BaseModeStrategy implements DebateModeStrategy {
  abstract readonly name: string;

  abstract executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]>;

  abstract buildAgentPrompt(context: DebateContext): string;

  /**
   * Execute all agents in parallel
   *
   * All agents respond simultaneously, seeing only previous rounds' responses.
   * Best for: Collaborative, Expert Panel, Delphi modes
   *
   * Handles individual agent errors gracefully - continues with other agents.
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

    // Build context with mode-specific prompt
    const contextWithModePrompt: DebateContext = {
      ...context,
      modePrompt: this.buildAgentPrompt(context),
    };

    // Execute all agents in parallel with error handling
    const responsePromises = agents.map((agent) => {
      agent.setToolkit(toolkit);
      return agent.generateResponse(contextWithModePrompt);
    });

    // Use allSettled to handle individual failures gracefully
    const results = await Promise.allSettled(responsePromises);

    const responses: AgentResponse[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const agent = agents[i];
      if (!result || !agent) continue;

      if (result.status === 'fulfilled') {
        responses.push(result.value);
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

    for (const agent of agents) {
      try {
        // Build context with accumulated responses from current round
        const currentContext: DebateContext = {
          ...context,
          previousResponses: [...context.previousResponses, ...responses],
          modePrompt: this.buildAgentPrompt({
            ...context,
            previousResponses: [...context.previousResponses, ...responses],
          }),
        };

        agent.setToolkit(toolkit);
        const response = await agent.generateResponse(currentContext);
        responses.push(response);
      } catch (error) {
        // Log error but continue with other agents
        logger.error({ err: error, agentId: agent.id }, 'Error from agent');
      }
    }

    return responses;
  }
}
