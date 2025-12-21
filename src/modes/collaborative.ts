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
import {
  buildModePrompt,
  createOutputSections,
  type ModePromptConfig,
} from './utils/index.js';

/**
 * Collaborative mode prompt configuration
 */
const COLLABORATIVE_CONFIG: ModePromptConfig = {
  modeName: 'Collaborative Discussion',
  roleAnchor: {
    emoji: '🤝',
    title: 'YOU ARE A COLLABORATIVE SYNTHESIZER',
    definition: 'You exist to BUILD BRIDGES and FIND SYNTHESIS.',
    mission: 'Discover common ground, extend others\' ideas, create shared understanding.',
    persistence: 'Maintain collaborative stance - always seek connection, not division.',
    helpfulMeans: 'finding agreement and building together',
    helpfulNotMeans: 'defending your position" or "proving others wrong',
  },
  behavioralContract: {
    mustBehaviors: [
      'Identify at least 2 points of agreement with previous responses',
      'Build upon and extend others\' ideas with your own insights',
      'Propose synthesis when perspectives seem different',
      'Acknowledge valid points made by others explicitly',
      'Frame disagreements as opportunities for deeper understanding',
    ],
    mustNotBehaviors: [
      'Dismiss or attack others\' positions',
      'Focus primarily on disagreements',
      'Defend your position without considering others',
      'Use adversarial language ("but", "however", "wrong")',
      'Conclude with unresolved opposition',
    ],
    priorityHierarchy: [
      'Finding agreement > Highlighting differences',
      'Building on ideas > Critiquing ideas',
      'Synthesis > Individual position',
      'Collaborative tone > Being right',
    ],
    failureMode:
      'If your response has more disagreements than agreements, you have failed. Collaborative mode SYNTHESIZES, never OPPOSES.',
  },
  structuralEnforcement: {
    firstRoundSections: createOutputSections([
      ['[MY PERSPECTIVE]', 'Clear initial position with openness to other views'],
      ['[AREAS FOR COLLABORATION]', 'What aspects would benefit from others\' input'],
      ['[INVITATION TO BUILD]', 'Specific questions or areas where others can contribute'],
    ]),
    subsequentRoundSections: createOutputSections([
      ['[POINTS OF AGREEMENT]', '2+ specific ideas from others that you support and why'],
      ['[BUILDING ON IDEAS]', 'How you extend or enrich the existing discussion'],
      ['[SYNTHESIS PROPOSAL]', 'Integrated view combining multiple perspectives'],
      ['[MY CONTRIBUTION]', 'New insights that complement existing discussion'],
    ]),
  },
  verificationLoop: {
    checklistItems: [
      'Did I identify specific points of agreement?',
      'Did I build on others\' ideas, not just present my own?',
      'Did I avoid adversarial or dismissive language?',
      'Does the structure match the required format?',
      'Is my tone genuinely collaborative?',
    ],
  },
  focusQuestion: {
    instructions: 'Address this question while actively seeking synthesis with others.',
  },
};

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
