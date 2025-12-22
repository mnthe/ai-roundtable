/**
 * Socratic Debate Mode
 *
 * In Socratic mode, agents engage through questioning rather than
 * asserting positions. The focus is on exploring ideas through
 * dialogue and collaborative inquiry.
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
import { buildModePrompt } from './utils/index.js';
import { SOCRATIC_CONFIG } from './configs/index.js';

/**
 * Socratic mode strategy
 *
 * Characteristics:
 * - Heavy use of probing questions
 * - Focus on uncovering assumptions
 * - Explore ideas through dialogue
 * - Seek deeper understanding rather than winning
 */
export class SocraticMode extends BaseModeStrategy {
  readonly name = 'socratic';
  readonly needsGroupthinkDetection = false;

  /**
   * Execute a Socratic round
   *
   * Agents respond sequentially, with each building on
   * previous questions and insights.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeSequential(agents, context, toolkit);
  }

  /**
   * Build Socratic-specific prompt
   *
   * Encourages agents to:
   * - Ask probing questions
   * - Uncover hidden assumptions
   * - Explore implications
   * - Seek clarity and precision
   */
  buildAgentPrompt(context: DebateContext): string {
    return buildModePrompt(SOCRATIC_CONFIG, context);
  }
}
