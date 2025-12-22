/**
 * Collaborative Debate Mode
 *
 * In collaborative mode, agents work together to find common ground
 * and build upon each other's ideas. All agents respond in parallel,
 * seeing only previous rounds' responses.
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
import { buildModePrompt } from './utils/index.js';
import { COLLABORATIVE_CONFIG } from './configs/index.js';

/**
 * Collaborative mode strategy
 *
 * Characteristics:
 * - Agents run in parallel (Promise.all)
 * - Focus on finding agreement and synthesis
 * - Build upon others' ideas from previous rounds
 * - Encourage constructive dialogue
 */
export class CollaborativeMode extends BaseModeStrategy {
  readonly name = 'collaborative';
  readonly needsGroupthinkDetection = true;

  /**
   * Execute a collaborative round
   *
   * All agents respond simultaneously, seeing only the previous rounds'
   * responses (not responses from the current round).
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeParallel(agents, context, toolkit);
  }

  /**
   * Build collaborative-specific prompt
   *
   * Encourages agents to:
   * - Find common ground
   * - Build on others' ideas
   * - Seek synthesis and agreement
   * - Be constructive and collaborative
   */
  buildAgentPrompt(context: DebateContext): string {
    return buildModePrompt(COLLABORATIVE_CONFIG, context);
  }
}
