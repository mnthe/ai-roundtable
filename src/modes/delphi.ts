/**
 * Delphi Method Debate Mode
 *
 * In Delphi mode, agents provide anonymous opinions that are aggregated
 * statistically. Each round presents anonymized feedback and statistical
 * summaries to guide towards consensus.
 *
 * Uses context processors via transformContext hook:
 * - AnonymizationProcessor: Replaces agent identities with "Participant N"
 * - StatisticsProcessor: Injects round statistics into modePrompt
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
import {
  buildRoleAnchor,
  buildBehavioralContract,
  buildVerificationLoop,
  buildFocusQuestionSection,
  createOutputSections,
  PROMPT_SEPARATOR,
  type RoleAnchorConfig,
  type BehavioralContractConfig,
  type VerificationLoopConfig,
  type FocusQuestionConfig,
  type OutputSection,
} from './utils/index.js';
import {
  createProcessorChain,
  createAnonymizationProcessor,
  createStatisticsProcessor,
  type ContextProcessor,
} from './processors/index.js';

/**
 * Alias for backward compatibility within this file
 */
const SEPARATOR = PROMPT_SEPARATOR;

/**
 * Delphi mode role anchor configuration
 */
const DELPHI_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '🔮',
  title: 'YOU ARE AN ANONYMOUS INDEPENDENT EXPERT',
  definition: 'You provide independent expert opinion in an anonymous consensus process.',
  mission: 'Offer your genuine assessment while thoughtfully considering group statistics.',
  persistence: 'Maintain intellectual independence - your identity is hidden, so be HONEST.',
  helpfulMeans: 'providing your true, independent assessment',
  helpfulNotMeans: 'converging to the majority" or "going along with the group',
  additionalContext: 'Anonymity protects you. Use it to be maximally honest.',
};

/**
 * Delphi mode behavioral contract configuration
 */
const DELPHI_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'State your position clearly and unambiguously',
    'Provide explicit confidence level (0-100%)',
    'Explain reasoning with evidence',
    'Consider group statistics thoughtfully, not blindly',
    'Adjust only when genuinely persuaded, not for conformity',
  ],
  mustNotBehaviors: [
    'Change position just because others disagree (groupthink)',
    'Hide uncertainty behind vague language',
    'Ignore valid arguments from the group entirely',
    'Overstate confidence to seem authoritative',
    'Understate confidence to avoid commitment',
  ],
  priorityHierarchy: [
    'Honest assessment > Social conformity',
    'Evidence-based adjustment > Pressure to converge',
    'Clear confidence statement > Vague hedging',
    'Genuine reasoning > Appearing agreeable',
  ],
  failureMode:
    'If you change your position without genuine new reasoning, or conform just to match the majority, you have failed the Delphi process.',
};

/**
 * Delphi mode verification loop configuration
 */
const DELPHI_VERIFICATION_LOOP: VerificationLoopConfig = {
  checklistItems: [
    'Is my position clearly stated?',
    'Did I provide an explicit confidence percentage?',
    'If I changed my position, do I have genuine new reasons?',
    'Am I being honest, or conforming to the group?',
    'Does the structure match the required format?',
  ],
};

/**
 * Delphi mode focus question configuration
 */
const DELPHI_FOCUS_QUESTION: FocusQuestionConfig = {
  instructions: 'Provide your independent expert opinion on this specific question.\nBe honest - anonymity protects you.',
};

/**
 * First round output sections
 */
const FIRST_ROUND_SECTIONS: OutputSection[] = createOutputSections([
  ['[MY POSITION]', 'Clear, unambiguous statement of your view'],
  ['[CONFIDENCE LEVEL]', 'Explicit percentage 0-100% with brief justification'],
  ['[REASONING & EVIDENCE]', 'Support for your position'],
  ['[KEY UNCERTAINTIES]', 'What could change your mind'],
]);

/**
 * Subsequent round output sections
 */
const SUBSEQUENT_ROUND_SECTIONS: OutputSection[] = createOutputSections([
  ['[MY POSITION]', 'Clear, unambiguous statement of your view'],
  ['[CONFIDENCE LEVEL]', 'Explicit percentage 0-100% with brief justification'],
  ['[RESPONSE TO GROUP]', 'How you\'ve considered group statistics - agreement or disagreement with reasoning'],
  ['[REASONING & EVIDENCE]', 'Support for your position'],
  ['[POSITION CHANGE JUSTIFICATION] (if applicable)', 'If you changed your position, explain what genuinely persuaded you'],
]);

/**
 * Delphi Method mode strategy
 *
 * Characteristics:
 * - Anonymous responses (agent names replaced with "Participant N")
 * - Statistical aggregation of confidence and positions
 * - Round-by-round feedback with statistics
 * - Parallel execution for independent opinions
 * - Convergence towards consensus through iteration
 *
 * Uses context processors via transformContext hook:
 * - AnonymizationProcessor: Anonymizes agent identities
 * - StatisticsProcessor: Injects round statistics into modePrompt
 */
export class DelphiMode extends BaseModeStrategy {
  readonly name = 'delphi';
  readonly needsGroupthinkDetection = true;

  /** Processor chain for context transformation */
  private readonly processorChain: ContextProcessor;

  constructor() {
    super();
    // Create processor chain: anonymize responses, then inject statistics
    this.processorChain = createProcessorChain([
      createAnonymizationProcessor(),
      createStatisticsProcessor(),
    ]);
  }

  /**
   * Execute a Delphi round
   *
   * All agents respond in parallel. Context transformation (anonymization
   * and statistics injection) is handled by the transformContext hook.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeParallel(agents, context, toolkit);
  }

  /**
   * Transform context before passing to agents.
   *
   * Applies processor chain:
   * 1. AnonymizationProcessor: Replaces agent identities with "Participant N"
   * 2. StatisticsProcessor: Injects round statistics into modePrompt
   */
  protected override transformContext(context: DebateContext, _agent: BaseAgent): DebateContext {
    return this.processorChain.process(context);
  }

  /**
   * Build Delphi-specific prompt
   *
   * Includes:
   * - Explanation of anonymous methodology
   * - Statistical summaries from previous rounds
   * - Instructions for independent assessment
   */
  buildAgentPrompt(context: DebateContext): string {
    let prompt = `
Mode: Delphi Method
`;

    // Layer 1: Role Anchor
    prompt += buildRoleAnchor(DELPHI_ROLE_ANCHOR);

    // Layer 2: Behavioral Contract
    prompt += buildBehavioralContract(DELPHI_BEHAVIORAL_CONTRACT);

    // Layer 3: Structural Enforcement (custom for Delphi due to statistics)
    prompt += this.buildStructuralEnforcementWithStats(context);

    // Layer 4: Verification Loop
    prompt += buildVerificationLoop(DELPHI_VERIFICATION_LOOP);

    // Focus Question (if present)
    prompt += buildFocusQuestionSection(context, DELPHI_FOCUS_QUESTION);

    return prompt;
  }

  /**
   * Build structural enforcement layer for Delphi mode
   *
   * Statistics are injected separately by StatisticsProcessor via transformContext.
   * This method only handles the required output structure.
   */
  private buildStructuralEnforcementWithStats(context: DebateContext): string {
    let prompt = `
${SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${SEPARATOR}

`;

    if (context.previousResponses.length > 0) {
      // Statistics will be appended by StatisticsProcessor via transformContext
      prompt += `REQUIRED OUTPUT STRUCTURE:

`;

      for (const section of SUBSEQUENT_ROUND_SECTIONS) {
        prompt += `${section.header}
(${section.description})

`;
      }
    } else {
      prompt += `REQUIRED OUTPUT STRUCTURE (First Round):

`;

      for (const section of FIRST_ROUND_SECTIONS) {
        prompt += `${section.header}
(${section.description})

`;
      }

      prompt += `Your response will be anonymized and shared with aggregate statistics.
`;
    }

    return prompt;
  }
}
