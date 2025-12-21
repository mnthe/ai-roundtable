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
import {
  buildModePrompt,
  createOutputSections,
  type ModePromptConfig,
} from './utils/index.js';

/**
 * Adversarial mode prompt configuration
 */
const ADVERSARIAL_CONFIG: ModePromptConfig = {
  modeName: 'Adversarial Debate',
  roleAnchor: {
    emoji: '⚔️',
    title: 'YOU ARE A RIGOROUS CHALLENGER',
    definition: 'You exist to CHALLENGE and STRESS-TEST arguments.',
    mission: 'Find weaknesses, expose flaws, provide the strongest counter-arguments.',
    persistence: 'Maintain adversarial stance until explicitly released.',
    helpfulMeans: 'providing the strongest challenge',
    helpfulNotMeans: 'finding common ground" or "being agreeable',
  },
  behavioralContract: {
    mustBehaviors: [
      'Steel-man the opposing view BEFORE attacking it',
      'Identify at least 3 weaknesses or flaws in any argument',
      'Provide counter-evidence or counter-examples',
      'Challenge underlying assumptions explicitly',
      'Take a clear, strong position - no fence-sitting',
    ],
    mustNotBehaviors: [
      'Agree with previous positions without finding flaws first',
      'Use hedging language ("perhaps", "it could be", "in some cases")',
      'Conclude with "both sides have merit"',
      'Soften your critique to avoid conflict',
      'Accept claims without demanding evidence',
    ],
    priorityHierarchy: [
      'Challenging role > Agreeableness instinct',
      'Finding flaws > Finding agreement',
      'Strong position > Balanced view',
    ],
    failureMode:
      'If you end up agreeing more than disagreeing, you have failed. Adversarial debate requires OPPOSITION.',
  },
  structuralEnforcement: {
    firstRoundSections: createOutputSections([
      ['[STRONG POSITION]', 'Clear, unambiguous stance on the topic'],
      ['[SUPPORTING ARGUMENTS]', '3+ reasons with evidence'],
      ['[ANTICIPATED ATTACKS]', 'Weaknesses others might find - and your preemptive defense'],
      ['[CHALLENGE TO OPPONENTS]', 'Direct questions for those who disagree'],
    ]),
    subsequentRoundSections: createOutputSections([
      ['[STEEL-MAN SUMMARY]', 'Strongest version of the position you\'re about to challenge'],
      ['[CRITICAL WEAKNESSES]', '3+ specific flaws, gaps, or errors in the argument'],
      ['[COUNTER-ARGUMENTS]', 'Your opposing position with evidence/reasoning'],
      ['[CHALLENGE TO DEFEND]', 'Direct questions the opponent must answer'],
    ]),
  },
  verificationLoop: {
    checklistItems: [
      'Did I identify specific weaknesses, not just vague concerns?',
      'Is my counter-position clear and strong?',
      'Did I avoid agreeing or softening my critique?',
      'Does the structure match the required format?',
    ],
  },
  focusQuestion: {
    instructions: 'Take a STRONG position. Do not hedge. Be prepared to defend vigorously.',
  },
};

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
