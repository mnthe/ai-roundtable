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
  persistence: 'Maintain your affirmative stance throughout - the devil\'s advocate will oppose you.',
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
 */
const OPPOSITION_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '😈',
  title: 'YOU ARE THE DEVIL\'S ADVOCATE - YOU MUST OPPOSE',
  definition: 'You MUST take the OPPOSITE position of the previous agent.',
  mission: 'Argue AGAINST whatever stance was just presented with full conviction.',
  persistence: 'Stay in opposition mode - NEVER agree or soften your stance.',
  helpfulMeans: 'strongly OPPOSING the previous position',
  helpfulNotMeans: 'being balanced" or "finding common ground',
};

const OPPOSITION_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Set "stance": "NO" in your JSON response (MANDATORY)',
    'Your position MUST contradict the previous agent\'s position',
    'Present 3 counter-arguments attacking their position',
    'Argue with full conviction as the devil\'s advocate',
  ],
  mustNotBehaviors: [
    'Set stance to "YES" or "NEUTRAL" (you MUST use "NO")',
    'Agree with ANY part of the previous position',
    'Conclude that "both sides have merit"',
    'Soften your opposition with qualifications',
  ],
  priorityHierarchy: [],
  failureMode: 'If your stance is not "NO", you have FAILED your role.',
};

const OPPOSITION_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'stance is exactly "NO"',
    'position argues AGAINST the topic',
    'reasoning contains counter-arguments only',
    'No agreement or validation of previous position',
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
    'Add your own position (evaluate, don\'t argue)',
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
  OPPOSITION: 'OPPOSITION (Devil\'s Advocate)',
  EVALUATOR: 'EVALUATOR',
};

/**
 * Devil's Advocate mode strategy
 *
 * Characteristics:
 * - First agent: Normal position on the topic (PRIMARY)
 * - Second agent: Forced to take opposing stance (OPPOSITION)
 * - Remaining agents: Evaluate and judge both perspectives (EVALUATOR)
 * - Sequential execution to maintain role clarity
 *
 * Uses hooks:
 * - getAgentRole: Assigns PRIMARY/OPPOSITION/EVALUATOR based on agent index
 * - transformContext: Injects agent index into context for prompt building
 * - validateResponse: Enforces expected stance for each role
 */
export class DevilsAdvocateMode extends BaseModeStrategy {
  readonly name = 'devils-advocate';
  override readonly executionPattern = 'sequential' as const;

  /**
   * Tracks current agent index during sequential execution.
   * Used by validateResponse to determine the correct stance.
   */
  private currentAgentIndex = 0;

  /**
   * Execute a devil's advocate round
   *
   * Uses the base executeSequential with hooks for role assignment,
   * context transformation, and stance validation.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Reset agent index tracker for this round
    this.currentAgentIndex = 0;

    return this.executeSequential(agents, context, toolkit);
  }

  /**
   * Get the role for an agent based on their index.
   * Hook implementation for BaseModeStrategy.
   *
   * Role assignment:
   * - Index 0: PRIMARY (Affirmative)
   * - Index 1: OPPOSITION (Devil's Advocate)
   * - Index 2+: EVALUATOR
   */
  protected override getAgentRole(
    _agent: BaseAgent,
    index: number,
    _context: DebateContext
  ): DevilsAdvocateRole {
    if (index === 0) return 'PRIMARY';
    if (index === 1) return 'OPPOSITION';
    return 'EVALUATOR';
  }

  /**
   * Transform context to inject the current agent index.
   * Hook implementation for BaseModeStrategy.
   *
   * This ensures that buildAgentPrompt can determine the correct role
   * based on the agent's position in the current round, not the total
   * number of previous responses (which includes prior rounds).
   */
  protected override transformContext(context: DebateContext, _agent: BaseAgent): DevilsAdvocateContext {
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
  protected override validateResponse(response: AgentResponse, context: DebateContext): AgentResponse {
    // Get the role for the current agent
    const role = this.getRoleForIndex(this.currentAgentIndex);
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
   * Get the role for a given index.
   */
  private getRoleForIndex(index: number): DevilsAdvocateRole {
    if (index === 0) return 'PRIMARY';
    if (index === 1) return 'OPPOSITION';
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

    if (agentIndex === 0) {
      return this.buildPrimaryPrompt(context, isFirstRound);
    } else if (agentIndex === 1) {
      return this.buildOppositionPrompt(context, isFirstRound);
    } else {
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
`;

    prompt += buildRoleAnchor(OPPOSITION_ROLE_ANCHOR);
    prompt += buildBehavioralContract(OPPOSITION_BEHAVIORAL_CONTRACT);
    prompt += this.buildOppositionStructuralEnforcement();
    prompt += buildVerificationLoop(OPPOSITION_VERIFICATION);

    if (!isFirstRound) {
      prompt += `
ROUND ${context.currentRound} CONTEXT:
Introduce NEW counter-arguments. Attack weaknesses revealed in prior rounds.
`;
    }

    if (context.focusQuestion) {
      prompt += `
FOCUS: ${context.focusQuestion}
Argue the OPPOSITE of whatever the previous agent said about this.
`;
    }

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

Your JSON response MUST include:
{
  "stance": "NO",  // <- MANDATORY: Must be exactly "NO"
  "position": "Your opposing position against the topic",
  "reasoning": "Your 3 counter-arguments with evidence",
  "confidence": 0.0-1.0
}

FORBIDDEN PHRASES in position/reasoning:
- "I agree with..." / "They make a good point..."
- "Both sides have merit" / "There's truth to both"
- "I see their perspective" / "They're partially right"
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
