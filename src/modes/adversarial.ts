/**
 * Adversarial Debate Mode
 *
 * In adversarial mode, agents take opposing stances and challenge
 * each other's arguments. This mode is designed to stress-test ideas
 * and expose weaknesses in reasoning.
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
import { buildModePrompt } from './utils/index.js';
import { ADVERSARIAL_CONFIG } from './configs/index.js';

/**
 * Adversarial mode strategy
 *
 * Characteristics:
 * - Agents take opposing or critical stances
 * - Focus on challenging and testing arguments
 * - Look for weaknesses and counter-arguments
 * - Encourage rigorous debate and steel-manning
 */
export class AdversarialMode extends BaseModeStrategy {
  readonly name = 'adversarial';
  readonly needsGroupthinkDetection = false;

  /**
   * Execute an adversarial round
   *
   * Agents respond sequentially, with each agent seeing and
   * challenging previous responses from the current round.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeSequential(agents, context, toolkit);
  }

  /**
   * Build adversarial-specific prompt
   *
   * Encourages agents to:
   * - Challenge and critique other positions
   * - Find weaknesses in arguments
   * - Steel-man opposing views before attacking
   * - Provide strong counter-arguments
   */
  buildAgentPrompt(context: DebateContext): string {
    return buildModePrompt(ADVERSARIAL_CONFIG, context);
  }
}
