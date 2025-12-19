/**
 * Base Debate Mode Strategy
 */

import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

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
