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
  type RoleAnchorConfig,
  type BehavioralContractConfig,
  type VerificationLoopConfig,
} from './utils/index.js';

const logger = createLogger('DevilsAdvocateMode');

/**
 * Separator line used in prompts
 */
const SEPARATOR = '═══════════════════════════════════════════════════════════════════';

/**
 * Role identifiers for devils-advocate mode
 */
type DevilsAdvocateRole = 'PRIMARY' | 'OPPOSITION' | 'EVALUATOR';

/**
 * Extended context for devils-advocate mode with agent index tracking
 */
interface DevilsAdvocateContext extends DebateContext {
  /** Current agent index within the round (0-based) */
  _agentIndexInRound?: number;
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
  override readonly executionPattern = 'sequential' as const;

  /**
   * Tracks current agent index during sequential execution.
   * Used by validateResponse to determine the correct stance.
   */
  private currentAgentIndex = 0;

  /**
   * Total number of agents in the current round.
   * Used for balanced role distribution.
   */
  private totalAgentsInRound = 3;

  /**
   * Execute a devil's advocate round
   *
   * Always uses sequential execution to ensure role compliance.
   * OPPOSITION agents need to see PRIMARY responses to properly understand
   * their role assignment in the debate structure.
   *
   * Uses hooks for role assignment, context transformation, and stance validation.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Reset trackers for this round
    this.currentAgentIndex = 0;
    this.totalAgentsInRound = agents.length;

    // Always use sequential execution for devils-advocate mode
    return this.executeWithFlags(agents, context, toolkit, 'sequential');
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
    _agent: BaseAgent,
    index: number,
    _context: DebateContext
  ): DevilsAdvocateRole {
    return this.getRoleForIndex(index, this.totalAgentsInRound);
  }

  /**
   * Transform context to inject the current agent index.
   * Hook implementation for BaseModeStrategy.
   *
   * This ensures that buildAgentPrompt can determine the correct role
   * based on the agent's position in the current round, not the total
   * number of previous responses (which includes prior rounds).
   */
  protected override transformContext(
    context: DebateContext,
    _agent: BaseAgent
  ): DevilsAdvocateContext {
    const transformedContext: DevilsAdvocateContext = {
      ...context,
      _agentIndexInRound: this.currentAgentIndex,
      // Rebuild modePrompt with the correct agent index
      modePrompt: this.buildAgentPromptForIndex(context, this.currentAgentIndex),
    };
    return transformedContext;
  }

  /**
   * Validate response and enforce expected stance.
   * Hook implementation for BaseModeStrategy.
   *
   * Uses StanceValidator to enforce the expected stance based on agent index.
   */
  protected override validateResponse(
    response: AgentResponse,
    context: DebateContext
  ): AgentResponse {
    // Get the role for the current agent
    const role = this.getRoleForIndex(this.currentAgentIndex, this.totalAgentsInRound);
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

    // Increment agent index for next validation
    this.currentAgentIndex++;

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
   * Build devil's advocate-specific prompt
   *
   * Role assignment:
   * - First agent: Present normal position
   * - Second agent: Take opposing stance (devil's advocate)
   * - Remaining agents: Evaluate both perspectives
   *
   * Note: When called from the base executeSequential, the context will
   * have been transformed by transformContext to include _agentIndexInRound.
   * Fallback to previousResponses.length for backward compatibility.
   */
  buildAgentPrompt(context: DebateContext): string {
    // Use _agentIndexInRound if available (set by transformContext),
    // otherwise fallback to previousResponses.length
    const daContext = context as DevilsAdvocateContext;
    const agentIndex = daContext._agentIndexInRound ?? context.previousResponses.length;
    return this.buildAgentPromptForIndex(context, agentIndex);
  }

  /**
   * Build devil's advocate-specific prompt with explicit agent index
   *
   * This method is used internally to build prompts for specific roles.
   */
  private buildAgentPromptForIndex(context: DebateContext, agentIndex: number): string {
    const isFirstRound = context.currentRound === 1;
    const role = this.getRoleForIndex(agentIndex, this.totalAgentsInRound);

    switch (role) {
      case 'PRIMARY':
        return this.buildPrimaryPrompt(context, isFirstRound);
      case 'OPPOSITION':
        return this.buildOppositionPrompt(context, isFirstRound);
      case 'EVALUATOR':
        return this.buildEvaluatorPrompt(context, isFirstRound);
    }
  }

  /**
   * Build Primary (Affirmative) role prompt
   */
  private buildPrimaryPrompt(context: DebateContext, isFirstRound: boolean): string {
    let prompt = `
Mode: Devil's Advocate - PRIMARY POSITION (AFFIRMATIVE)
`;

    prompt += buildRoleAnchor(PRIMARY_ROLE_ANCHOR);
    prompt += buildBehavioralContract(PRIMARY_BEHAVIORAL_CONTRACT);
    prompt += this.buildPrimaryStructuralEnforcement();
    prompt += buildVerificationLoop(PRIMARY_VERIFICATION);

    if (!isFirstRound) {
      prompt += `
ROUND ${context.currentRound} CONTEXT:
Strengthen your position based on prior exchanges.
`;
    }

    if (context.focusQuestion) {
      prompt += `
FOCUS: ${context.focusQuestion}
`;
    }

    return prompt;
  }

  /**
   * Build Opposition (Devil's Advocate) role prompt
   */
  private buildOppositionPrompt(context: DebateContext, isFirstRound: boolean): string {
    let prompt = `
Mode: Devil's Advocate - OPPOSITION ROLE

┌────────────────────────────────────────────────────────────────┐
│  Your assigned debate position: NO (argue AGAINST the topic)  │
│  Goal: Stress-test the proposition with strong counter-cases  │
└────────────────────────────────────────────────────────────────┘
`;

    prompt += buildRoleAnchor(OPPOSITION_ROLE_ANCHOR);
    prompt += buildBehavioralContract(OPPOSITION_BEHAVIORAL_CONTRACT);
    prompt += this.buildOppositionStructuralEnforcement();
    prompt += buildVerificationLoop(OPPOSITION_VERIFICATION);

    if (!isFirstRound) {
      prompt += `
ROUND ${context.currentRound} CONTEXT:
Build on previous rounds. Introduce new counter-arguments or strengthen existing ones.
Address any rebuttals to your position from the previous round.
`;
    }

    if (context.focusQuestion) {
      prompt += `
FOCUS: ${context.focusQuestion}
Present the counter-perspective on this specific question.
`;
    }

    prompt += `
${SEPARATOR}
REMINDER: You are the designated opposition in this debate exercise.
Your role is to present the strongest possible case for NO.
This ensures the topic receives thorough examination from all angles.
${SEPARATOR}
`;

    return prompt;
  }

  /**
   * Build Evaluator role prompt
   */
  private buildEvaluatorPrompt(context: DebateContext, isFirstRound: boolean): string {
    let prompt = `
Mode: Devil's Advocate - EVALUATOR ROLE
`;

    prompt += buildRoleAnchor(EVALUATOR_ROLE_ANCHOR);
    prompt += buildBehavioralContract(EVALUATOR_BEHAVIORAL_CONTRACT);
    prompt += this.buildEvaluatorStructuralEnforcement();
    prompt += buildVerificationLoop(EVALUATOR_VERIFICATION);

    if (!isFirstRound) {
      prompt += `
ROUND ${context.currentRound} CONTEXT:
Evaluate how positions have evolved. Which adapted better?
`;
    }

    if (context.focusQuestion) {
      prompt += `
FOCUS: ${context.focusQuestion}
Evaluate which position better addresses this question.
`;
    }

    return prompt;
  }

  /**
   * Build structural enforcement for Primary role
   */
  private buildPrimaryStructuralEnforcement(): string {
    return `
${SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${SEPARATOR}

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
${SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${SEPARATOR}

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
${SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${SEPARATOR}

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
