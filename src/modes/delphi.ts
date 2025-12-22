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
  PROMPT_SEPARATOR,
} from './utils/index.js';
import {
  createProcessorChain,
  createAnonymizationProcessor,
  createStatisticsProcessor,
  type ContextProcessor,
} from './processors/index.js';
import {
  DELPHI_ROLE_ANCHOR,
  DELPHI_BEHAVIORAL_CONTRACT,
  DELPHI_VERIFICATION_LOOP,
  DELPHI_FOCUS_QUESTION,
  DELPHI_FIRST_ROUND_SECTIONS,
  DELPHI_SUBSEQUENT_ROUND_SECTIONS,
} from './configs/index.js';

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
    prompt += buildBehavioralContract(DELPHI_BEHAVIORAL_CONTRACT, context.mode);

    // Layer 3: Structural Enforcement (custom for Delphi due to statistics)
    prompt += this.buildStructuralEnforcementWithStats(context);

    // Layer 4: Verification Loop
    prompt += buildVerificationLoop(DELPHI_VERIFICATION_LOOP, context.mode);

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
${PROMPT_SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${PROMPT_SEPARATOR}

`;

    if (context.previousResponses.length > 0) {
      // Statistics will be appended by StatisticsProcessor via transformContext
      prompt += `REQUIRED OUTPUT STRUCTURE:

`;

      for (const section of DELPHI_SUBSEQUENT_ROUND_SECTIONS) {
        prompt += `${section.header}
(${section.description})

`;
      }
    } else {
      prompt += `REQUIRED OUTPUT STRUCTURE (First Round):

`;

      for (const section of DELPHI_FIRST_ROUND_SECTIONS) {
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
