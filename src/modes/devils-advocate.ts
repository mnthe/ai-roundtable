/**
 * Devil's Advocate Debate Mode
 *
 * In devil's advocate mode, one agent intentionally takes an opposing
 * stance to stress-test ideas. The first agent presents a normal position,
 * the second agent is forced to argue against it, and remaining agents
 * evaluate both perspectives.
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse, Stance } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { StanceValidator } from './validators/index.js';
import {
  buildRoleAnchor,
  buildBehavioralContract,
  buildVerificationLoop,
  PROMPT_SEPARATOR,
  type RoleAnchorConfig,
  type BehavioralContractConfig,
  type VerificationLoopConfig,
} from './utils/index.js';

const logger = createLogger('DevilsAdvocateMode');


/**
 * Role identifiers for devils-advocate mode
 */
type DevilsAdvocateRole = 'PRIMARY' | 'OPPOSITION' | 'EVALUATOR';

/**
 * Extended context for devils-advocate mode with agent index tracking
 * and concurrency-safe round state
 */
interface DevilsAdvocateContext extends DebateContext {
  /** Current agent index within the round (0-based) */
  _agentIndexInRound?: number;
  /** Concurrency-safe round state (bound to context, not instance) */
  _devilsAdvocateState?: {
    /** Total number of agents in the current round */
    totalAgentsInRound: number;
    /** Map of agent IDs to their indices for this round */
    agentIndexMap: Map<string, number>;
  };
}

/**
 * Primary (Affirmative) role configuration
 */
const PRIMARY_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '📢',
  title: 'YOU ARE THE PRIMARY POSITION HOLDER - AFFIRMATIVE STANCE',
  definition: 'You present the AFFIRMATIVE/YES/PRO position to be challenged.',
  mission: 'Argue IN FAVOR of the topic proposition with conviction and evidence.',
  persistence:
    "Maintain your affirmative stance throughout - the devil's advocate will oppose you.",
  helpfulMeans: 'presenting a strong AFFIRMATIVE position',
  helpfulNotMeans: 'being balanced" or "being neutral" or "showing both sides',
};

const PRIMARY_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Set "stance": "YES" in your JSON response (MANDATORY)',
    'Argue that the proposition IS true/worth it/should be done',
    'Present 3 strong supporting arguments with evidence',
    'Be confident and assertive in your position',
  ],
  mustNotBehaviors: [
    'Set stance to "NO" or "NEUTRAL" (you MUST use "YES")',
    'Argue AGAINST the topic proposition',
    'Use hedging language or acknowledge opposing views',
    'Present multiple positions or "both sides"',
  ],
  priorityHierarchy: [],
  failureMode: 'If your stance is not "YES", you have FAILED your role.',
};

const PRIMARY_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'stance is exactly "YES"',
    'position argues IN FAVOR of the topic',
    'reasoning contains supporting arguments only',
    'No hedging or balanced language',
  ],
};

/**
 * Opposition (Devil's Advocate) role configuration
 *
 * IMPORTANT: This role MUST argue NO regardless of the agent's personal opinion.
 * Uses clear boundaries with positive framing to encourage role compliance.
 */
const OPPOSITION_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '😈',
  title: "DEVIL'S ADVOCATE - YOUR ASSIGNED STANCE IS NO",
  definition: 'You are the designated opposition in this structured debate exercise.',
  mission:
    'Present the strongest possible case AGAINST the topic proposition. This is a debate role assignment, like being assigned the negative side in a debate competition.',
  persistence:
    'Maintain your NO stance throughout. Your role is to ensure the topic is thoroughly stress-tested.',
  helpfulMeans: 'building the strongest counter-arguments to challenge the proposition',
  helpfulNotMeans: 'sharing your personal agreement with the topic',
  additionalContext: `
YOUR SUCCESS CRITERIA:
- Present compelling counter-arguments that force the other side to strengthen their case
- Identify weaknesses, assumptions, and blind spots in the YES position
- Provide evidence-based rebuttals that must be addressed
- Maintain intellectual rigor while arguing the assigned NO position

ROLE BOUNDARIES:
This is a structured debate exercise. Your assigned stance (NO) takes precedence over personal views.
Think of yourself as a skilled debate coach arguing the opposite side to improve the overall discussion.

ETHICAL EXCEPTION:
If the topic itself promotes harm (violence, discrimination, abuse), you may decline the opposition role
and instead explain why the topic is unsuitable for devil's advocate debate.`,
};

const OPPOSITION_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Set "stance": "NO" in your JSON response (required for role)',
    'Argue AGAINST the topic proposition with evidence and reasoning',
    'Present 3 compelling reasons why the answer should be NO',
    'Challenge assumptions and identify potential risks/downsides',
  ],
  mustNotBehaviors: [
    'Set stance to "YES" or "NEUTRAL" (breaks the debate structure)',
    'Express personal agreement with the topic',
    'Validate or support the YES position',
  ],
  priorityHierarchy: [
    'Debate role (NO) takes precedence over personal views',
    'Quality of counter-arguments over expressing true beliefs',
    'Stress-testing the topic over being agreeable',
  ],
  failureMode: 'Role boundaries are strictly enforced for debate quality. Your response must argue NO.',
};

const OPPOSITION_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'stance is set to "NO" (my assigned role)',
    'position presents counter-arguments AGAINST the topic',
    'reasoning challenges the proposition with evidence',
    'I am arguing my assigned debate position, not personal views',
  ],
};

/**
 * Evaluator role configuration
 */
const EVALUATOR_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '⚖️',
  title: 'YOU ARE THE NEUTRAL EVALUATOR',
  definition: 'You objectively assess both positions.',
  mission: 'Identify which arguments are stronger and why.',
  persistence: 'Stay neutral - do not take sides unless evidence demands it.',
  helpfulMeans: 'rigorous, evidence-based evaluation',
  helpfulNotMeans: 'being nice to both sides" or "avoiding judgment',
};

const EVALUATOR_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Set "stance": "NEUTRAL" in your JSON response (MANDATORY)',
    'Evaluate both positions fairly',
    'Identify strongest and weakest arguments on each side',
    'Make a judgment call on which position is stronger',
    'Explain your reasoning with specific references',
  ],
  mustNotBehaviors: [
    'Set stance to "YES" or "NO" (you MUST use "NEUTRAL")',
    'Refuse to judge ("both have merit" without analysis)',
    "Add your own position (evaluate, don't argue)",
    'Be swayed by confident language over evidence',
  ],
  priorityHierarchy: [],
  failureMode: 'If your stance is not "NEUTRAL", you have FAILED your role.',
};

const EVALUATOR_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'stance is exactly "NEUTRAL"',
    'Both positions were analyzed',
    'A clear judgment was made',
    'Evaluation is evidence-based, not diplomatic',
  ],
};

/**
 * Mapping from role to expected stance
 */
const ROLE_TO_STANCE: Record<DevilsAdvocateRole, Stance> = {
  PRIMARY: 'YES',
  OPPOSITION: 'NO',
  EVALUATOR: 'NEUTRAL',
};

/**
 * Mapping from role to human-readable name (for logging)
 */
const ROLE_DISPLAY_NAMES: Record<DevilsAdvocateRole, string> = {
  PRIMARY: 'PRIMARY (Affirmative)',
  OPPOSITION: "OPPOSITION (Devil's Advocate)",
  EVALUATOR: 'EVALUATOR',
};

/**
 * Devil's Advocate mode strategy
 *
 * Characteristics:
 * - First agent: Normal position on the topic (PRIMARY)
 * - Second agent: Forced to take opposing stance (OPPOSITION)
 * - Remaining agents: Evaluate and judge both perspectives (EVALUATOR)
 * - Always uses sequential execution for role compliance
 *
 * Uses hooks:
 * - getAgentRole: Assigns PRIMARY/OPPOSITION/EVALUATOR based on agent index
 * - transformContext: Injects agent index into context for prompt building
 * - validateResponse: Enforces expected stance for each role
 */
export class DevilsAdvocateMode extends BaseModeStrategy {
  readonly name = 'devils-advocate';
  readonly needsGroupthinkDetection = false;

  /**
   * Execute a devil's advocate round
   *
   * Always uses sequential execution to ensure role compliance.
   * OPPOSITION agents need to see PRIMARY responses to properly understand
   * their role assignment in the debate structure.
   *
   * Uses hooks for role assignment, context transformation, and stance validation.
   *
   * Note: Round state is bound to context (not instance) for concurrency safety.
   * This allows the same mode instance to be safely reused across concurrent sessions.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Build agent index map for this round (context-bound, not instance-bound)
    const agentIndexMap = new Map<string, number>();
    agents.forEach((agent, index) => {
      agentIndexMap.set(agent.id, index);
    });

    // Create context with round state bound to it (concurrency-safe)
    const contextWithState: DevilsAdvocateContext = {
      ...context,
      _devilsAdvocateState: {
        totalAgentsInRound: agents.length,
        agentIndexMap,
      },
    };

    // Always use sequential execution for devils-advocate mode
    return this.executeSequential(agents, contextWithState, toolkit);
  }

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
   * Get the role for an agent based on their index.
   * Hook implementation for BaseModeStrategy.
   *
   * Role assignment (balanced distribution):
   * - First half of debaters: PRIMARY (Affirmative)
   * - Second half of debaters: OPPOSITION (Devil's Advocate)
   * - Remaining 1-2 agents: EVALUATOR
   *
   * Example for 6 agents: P, P, O, O, E, E
   * Example for 5 agents: P, P, O, O, E
   */
  protected override getAgentRole(
    agent: BaseAgent,
    index: number,
    context: DebateContext
  ): DevilsAdvocateRole {
    const state = (context as DevilsAdvocateContext)._devilsAdvocateState;
    const totalAgents = state?.totalAgentsInRound ?? 3;
    // Use the index from state map if available, otherwise fall back to provided index
    const agentIndex = state?.agentIndexMap.get(agent.id) ?? index;
    return this.getRoleForIndex(agentIndex, totalAgents);
  }

  /**
   * Transform context to inject the current agent index and role-specific additions.
   * Hook implementation for BaseModeStrategy.
   *
   * This adds role-specific guidance to the existing modePrompt
   * (which was already set by the base class executeSequential).
   */
  protected override transformContext(
    context: DebateContext,
    agent: BaseAgent
  ): DevilsAdvocateContext {
    const state = (context as DevilsAdvocateContext)._devilsAdvocateState;
    const agentIndex = state?.agentIndexMap.get(agent.id) ?? 0;
    const totalAgents = state?.totalAgentsInRound ?? 3;
    const role = this.getRoleForIndex(agentIndex, totalAgents);

    // Only add role-specific additions to existing modePrompt
    const roleAddition = this.buildRoleAddition(context, role);

    const transformedContext: DevilsAdvocateContext = {
      ...context,
      _agentIndexInRound: agentIndex,
      modePrompt: (context.modePrompt || '') + roleAddition,
    };
    return transformedContext;
  }

  /**
   * Build role-specific prompt addition.
   * This is appended to the base modePrompt, not a replacement.
   */
  private buildRoleAddition(context: DebateContext, role: DevilsAdvocateRole): string {
    const isFirstRound = context.currentRound === 1;

    switch (role) {
      case 'PRIMARY':
        return this.buildPrimaryRoleAddition(context, isFirstRound);
      case 'OPPOSITION':
        return this.buildOppositionRoleAddition(context, isFirstRound);
      case 'EVALUATOR':
        return this.buildEvaluatorRoleAddition(context, isFirstRound);
    }
  }

  /**
   * Build Primary (Affirmative) role addition
   */
  private buildPrimaryRoleAddition(context: DebateContext, isFirstRound: boolean): string {
    let addition = `

## Your Role: PRIMARY POSITION (AFFIRMATIVE)

${buildRoleAnchor(PRIMARY_ROLE_ANCHOR)}
${buildBehavioralContract(PRIMARY_BEHAVIORAL_CONTRACT, context.mode)}
${this.buildPrimaryStructuralEnforcement()}
${buildVerificationLoop(PRIMARY_VERIFICATION, context.mode)}`;

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
   * Build Opposition (Devil's Advocate) role addition
   */
  private buildOppositionRoleAddition(context: DebateContext, isFirstRound: boolean): string {
    let addition = `

## Your Role: OPPOSITION ROLE (Devil's Advocate)

┌────────────────────────────────────────────────────────────────┐
│  Your assigned debate position: NO (argue AGAINST the topic)  │
│  Goal: Stress-test the proposition with strong counter-cases  │
└────────────────────────────────────────────────────────────────┘

${buildRoleAnchor(OPPOSITION_ROLE_ANCHOR)}
${buildBehavioralContract(OPPOSITION_BEHAVIORAL_CONTRACT, context.mode)}
${this.buildOppositionStructuralEnforcement()}
${buildVerificationLoop(OPPOSITION_VERIFICATION, context.mode)}`;

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
   * Build Evaluator role addition
   */
  private buildEvaluatorRoleAddition(context: DebateContext, isFirstRound: boolean): string {
    let addition = `

## Your Role: EVALUATOR ROLE

${buildRoleAnchor(EVALUATOR_ROLE_ANCHOR)}
${buildBehavioralContract(EVALUATOR_BEHAVIORAL_CONTRACT, context.mode)}
${this.buildEvaluatorStructuralEnforcement()}
${buildVerificationLoop(EVALUATOR_VERIFICATION, context.mode)}`;

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
   * Validate response and enforce expected stance.
   * Hook implementation for BaseModeStrategy.
   *
   * Uses StanceValidator to enforce the expected stance based on agent index.
   * Agent index is retrieved from context-bound state using the response's agentId
   * (concurrency-safe).
   */
  protected override validateResponse(
    response: AgentResponse,
    context: DebateContext
  ): AgentResponse {
    const state = (context as DevilsAdvocateContext)._devilsAdvocateState;
    // Look up agent index from state using the response's agentId
    const agentIndex = state?.agentIndexMap.get(response.agentId) ?? 0;
    const totalAgents = state?.totalAgentsInRound ?? 3;

    // Get the role for the current agent
    const role = this.getRoleForIndex(agentIndex, totalAgents);
    const expectedStance = ROLE_TO_STANCE[role];
    const roleName = ROLE_DISPLAY_NAMES[role];

    // Check and log stance validation
    if (!response.stance || response.stance !== expectedStance) {
      logger.warn(
        {
          agentId: response.agentId,
          agentName: response.agentName,
          role: roleName,
          expectedStance,
          actualStance: response.stance ?? '(missing)',
        },
        response.stance
          ? 'Agent stance does not match assigned role, enforcing expected stance'
          : 'Agent did not provide stance, enforcing expected stance for role'
      );
    } else {
      logger.debug(
        {
          agentId: response.agentId,
          agentName: response.agentName,
          role: roleName,
          stance: response.stance,
        },
        'Agent stance matches assigned role'
      );
    }

    // Use StanceValidator to enforce stance
    const validator = new StanceValidator(expectedStance);
    const validatedResponse = validator.validate(response, context);

    return validatedResponse;
  }

  /**
   * Get the role for a given index based on balanced distribution.
   *
   * @param index - The agent's index (0-based)
   * @param totalAgents - Total number of agents in the round
   * @returns The role for this agent
   */
  private getRoleForIndex(index: number, totalAgents: number): DevilsAdvocateRole {
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
