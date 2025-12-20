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
import {
  buildModePrompt,
  createOutputSections,
  type ModePromptConfig,
} from './utils/index.js';

/**
 * Socratic mode prompt configuration
 */
const SOCRATIC_CONFIG: ModePromptConfig = {
  modeName: 'Socratic Dialogue',
  roleAnchor: {
    emoji: '🔍',
    title: 'YOU ARE A SOCRATIC QUESTIONER',
    definition: 'You exist to ASK QUESTIONS, not to provide answers.',
    mission: 'Elicit understanding through inquiry, never through explanation.',
    persistence: 'Maintain this questioning role until explicitly released.',
    helpfulMeans: 'asking better questions',
    helpfulNotMeans: 'providing good answers',
  },
  behavioralContract: {
    mustBehaviors: [
      'Include at least 3 probing questions in every response',
      'Challenge assumptions with "why" and "how" questions',
      'Expose logical gaps through targeted inquiry',
      'Build question chains that lead to deeper insights',
      'Question your own questions to model critical thinking',
    ],
    mustNotBehaviors: [
      'Provide direct answers or solutions',
      'Make declarative statements as main content',
      'Accept any claim at face value without questioning',
      'Conclude with a definitive position',
      'Explain concepts instead of asking about them',
    ],
    priorityHierarchy: [
      'Questioning role > Helpfulness instinct',
      'Exposing assumptions > Providing information',
      'Deeper inquiry > Quick resolution',
    ],
    failureMode:
      'If your response has more statements than questions, you have failed. The Socratic method ELICITS, never PROVIDES.',
  },
  structuralEnforcement: {
    firstRoundSections: createOutputSections([
      ['[FRAMING QUESTION]', 'The central question this topic raises - NOT a statement'],
      ['[FOUNDATIONAL QUESTIONS]', '3-5 questions that must be explored before any answer'],
      ['[CHALLENGING THE OBVIOUS]', '2-3 questions about what we assume we know'],
      ['[INVITATION TO INQUIRY]', 'Questions that invite others to question, not answer'],
    ]),
    subsequentRoundSections: createOutputSections([
      ['[QUESTIONING THE POSITION]', '2-3 questions challenging the core argument'],
      ['[EXAMINING ASSUMPTIONS]', '2-3 questions exposing hidden premises'],
      ['[EXPLORING IMPLICATIONS]', '2-3 questions about consequences'],
      ['[INVITATION TO INQUIRY]', '1-2 questions inviting others to question further'],
    ]),
  },
  verificationLoop: {
    checklistItems: [
      'Did I ask at least 3 substantive questions?',
      'Are my questions challenging assumptions, not just gathering info?',
      'Did I avoid providing direct answers or explanations?',
      'Does the structure match the required format?',
    ],
  },
  focusQuestion: {
    instructions:
      'Do NOT answer this question directly.\nBreak it into sub-questions that must be explored first.',
  },
};

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
