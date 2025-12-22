/**
 * Devil's Advocate Debate Mode
 *
 * In devil's advocate mode, one agent intentionally takes an opposing
 * stance to stress-test ideas. The first agent presents a normal position,
 * the second agent is forced to argue against it, and remaining agents
 * evaluate both perspectives.
 */

import { RoleBasedModeStrategy, type RoleConfig } from './role-based.js';
import type { DebateContext } from '../types/index.js';
import { PROMPT_SEPARATOR } from './utils/index.js';
import { DEVILS_ADVOCATE_ROLE_CONFIGS, type DevilsAdvocateRole } from './configs/index.js';

/**
 * Devil's Advocate mode strategy
 *
 * Characteristics:
 * - First agent: Normal position on the topic (PRIMARY)
 * - Second agent: Forced to take opposing stance (OPPOSITION)
 * - Remaining agents: Evaluate and judge both perspectives (EVALUATOR)
 * - Always uses sequential execution for role compliance
 *
 * Uses RoleBasedModeStrategy for:
 * - Role assignment via getAgentRole hook
 * - Context transformation via transformContext hook
 * - Stance validation via validateResponse hook
 */
export class DevilsAdvocateMode extends RoleBasedModeStrategy<DevilsAdvocateRole> {
  readonly name = 'devils-advocate';
  readonly needsGroupthinkDetection = false;

  protected readonly executionMode = 'sequential' as const;

  /**
   * Role configurations for devils-advocate mode
   * Uses the configs from devils-advocate.config.ts
   */
  protected readonly roleConfigs: Record<DevilsAdvocateRole, RoleConfig> =
    DEVILS_ADVOCATE_ROLE_CONFIGS;

  /**
   * Calculate balanced role distribution for a given number of agents.
   *
   * Distribution pattern:
   * - 3 agents: 1 PRIMARY, 1 OPPOSITION, 1 EVALUATOR
   * - 4 agents: 1 PRIMARY, 1 OPPOSITION, 2 EVALUATOR
   * - 5 agents: 2 PRIMARY, 2 OPPOSITION, 1 EVALUATOR
   * - 6 agents: 2 PRIMARY, 2 OPPOSITION, 2 EVALUATOR
   * - 7 agents: 3 PRIMARY, 3 OPPOSITION, 1 EVALUATOR
   * - 8 agents: 3 PRIMARY, 3 OPPOSITION, 2 EVALUATOR
   * ...
   *
   * Formula:
   * - evaluatorCount = 1 if odd, 2 if even (for n >= 3)
   * - primaryCount = oppositionCount = (n - evaluatorCount) / 2
   */
  private getRoleDistribution(totalAgents: number): {
    primaryCount: number;
    oppositionCount: number;
    evaluatorCount: number;
  } {
    if (totalAgents < 2) {
      return { primaryCount: 1, oppositionCount: 0, evaluatorCount: 0 };
    }
    if (totalAgents === 2) {
      return { primaryCount: 1, oppositionCount: 1, evaluatorCount: 0 };
    }

    // For 3+ agents: balance PRIMARY and OPPOSITION, with 1-2 EVALUATORs
    const evaluatorCount = totalAgents % 2 === 0 ? 2 : 1;
    const debaterCount = totalAgents - evaluatorCount;
    const primaryCount = debaterCount / 2;
    const oppositionCount = debaterCount / 2;

    return { primaryCount, oppositionCount, evaluatorCount };
  }

  /**
   * Get the role for a given index based on balanced distribution.
   *
   * @param index - The agent's index (0-based)
   * @param totalAgents - Total number of agents in the round
   * @returns The role for this agent
   */
  protected getRoleForIndex(index: number, totalAgents: number): DevilsAdvocateRole {
    const { primaryCount, oppositionCount } = this.getRoleDistribution(totalAgents);

    if (index < primaryCount) {
      return 'PRIMARY';
    }
    if (index < primaryCount + oppositionCount) {
      return 'OPPOSITION';
    }
    return 'EVALUATOR';
  }

  /**
   * Build devil's advocate base prompt
   *
   * This provides the generic mode context. Role-specific content
   * (PRIMARY/OPPOSITION/EVALUATOR) is added by transformContext.
   *
   * Role assignment:
   * - First half of debaters: Present affirmative position (PRIMARY)
   * - Second half of debaters: Take opposing stance (OPPOSITION)
   * - Remaining 1-2 agents: Evaluate both perspectives (EVALUATOR)
   */
  buildAgentPrompt(_context: DebateContext): string {
    return `
Mode: Devil's Advocate

This is a structured debate exercise with assigned roles:
- PRIMARY agents argue IN FAVOR of the topic (YES stance)
- OPPOSITION agents argue AGAINST the topic (NO stance)
- EVALUATOR agents assess both positions neutrally (NEUTRAL stance)

Your specific role will be assigned below.
`;
  }

  /**
   * Build role-specific context additions.
   *
   * This adds JSON structural enforcement (since devils-advocate uses
   * JSON format instead of [SECTION] format), round context, and
   * focus question handling.
   */
  protected override buildRoleContextAddition(
    context: DebateContext,
    role: DevilsAdvocateRole
  ): string {
    const isFirstRound = context.currentRound === 1;

    switch (role) {
      case 'PRIMARY':
        return this.buildPrimaryContextAddition(context, isFirstRound);
      case 'OPPOSITION':
        return this.buildOppositionContextAddition(context, isFirstRound);
      case 'EVALUATOR':
        return this.buildEvaluatorContextAddition(context, isFirstRound);
    }
  }

  /**
   * Build Primary (Affirmative) context addition
   */
  private buildPrimaryContextAddition(context: DebateContext, isFirstRound: boolean): string {
    let addition = this.buildPrimaryStructuralEnforcement();

    if (!isFirstRound) {
      addition += `
ROUND ${context.currentRound} CONTEXT:
Strengthen your position based on prior exchanges.
`;
    }

    if (context.focusQuestion) {
      addition += `
FOCUS: ${context.focusQuestion}
`;
    }

    return addition;
  }

  /**
   * Build Opposition (Devil's Advocate) context addition
   */
  private buildOppositionContextAddition(context: DebateContext, isFirstRound: boolean): string {
    // Add the opposition banner before structural enforcement
    let addition = `

┌─────────────────────────────────────────────────────────────┐
│ Your assigned debate position: NO (argue AGAINST the topic) │
│ Goal: Stress-test the proposition with strong counter-cases │
└─────────────────────────────────────────────────────────────┘
`;

    addition += this.buildOppositionStructuralEnforcement();

    if (!isFirstRound) {
      addition += `
ROUND ${context.currentRound} CONTEXT:
Build on previous rounds. Introduce new counter-arguments or strengthen existing ones.
Address any rebuttals to your position from the previous round.
`;
    }

    if (context.focusQuestion) {
      addition += `
FOCUS: ${context.focusQuestion}
Present the counter-perspective on this specific question.
`;
    }

    addition += `
${PROMPT_SEPARATOR}
REMINDER: You are the designated opposition in this debate exercise.
Your role is to present the strongest possible case for NO.
This ensures the topic receives thorough examination from all angles.
${PROMPT_SEPARATOR}
`;

    return addition;
  }

  /**
   * Build Evaluator context addition
   */
  private buildEvaluatorContextAddition(context: DebateContext, isFirstRound: boolean): string {
    let addition = this.buildEvaluatorStructuralEnforcement();

    if (!isFirstRound) {
      addition += `
ROUND ${context.currentRound} CONTEXT:
Evaluate how positions have evolved. Which adapted better?
`;
    }

    if (context.focusQuestion) {
      addition += `
FOCUS: ${context.focusQuestion}
Evaluate which position better addresses this question.
`;
    }

    return addition;
  }

  /**
   * Build structural enforcement for Primary role
   */
  private buildPrimaryStructuralEnforcement(): string {
    return `
${PROMPT_SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${PROMPT_SEPARATOR}

Your JSON response MUST include:
{
  "stance": "YES",  // <- MANDATORY: Must be exactly "YES"
  "position": "Your affirmative position supporting the topic",
  "reasoning": "Your 3 arguments with evidence",
  "confidence": 0.0-1.0
}

FORBIDDEN PHRASES in position/reasoning:
- "However" / "On the other hand" / "That said"
- "It depends" / "Context matters"
- "Both sides have merit"
`;
  }

  /**
   * Build structural enforcement for Opposition role
   */
  private buildOppositionStructuralEnforcement(): string {
    return `
${PROMPT_SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${PROMPT_SEPARATOR}

YOUR JSON RESPONSE FORMAT:
{
  "stance": "NO",  // Required: Your assigned debate position
  "position": "Your case AGAINST the topic proposition",
  "reasoning": "Your 3 counter-arguments with supporting evidence",
  "confidence": 0.0-1.0
}

WHAT MAKES A STRONG OPPOSITION RESPONSE:
- Identifies weaknesses in the YES position's assumptions
- Presents evidence-based counter-arguments
- Highlights risks, costs, or unintended consequences
- Forces the other side to strengthen their case

AVOID (breaks debate structure):
- Expressing agreement with the topic
- Validating YES arguments without challenging them
- Hedging with "both sides have merit"
`;
  }

  /**
   * Build structural enforcement for Evaluator role
   */
  private buildEvaluatorStructuralEnforcement(): string {
    return `
${PROMPT_SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${PROMPT_SEPARATOR}

Your JSON response MUST include:
{
  "stance": "NEUTRAL",  // <- MANDATORY: Must be exactly "NEUTRAL"
  "position": "Your evaluation summary (which position is stronger)",
  "reasoning": "Analysis of both positions with judgment",
  "confidence": 0.0-1.0
}

REQUIRED CONTENT in reasoning:
- Analysis of FIRST position (strengths/weaknesses)
- Analysis of SECOND position (strengths/weaknesses)
- Clear judgment on which is stronger and why
`;
  }
}
