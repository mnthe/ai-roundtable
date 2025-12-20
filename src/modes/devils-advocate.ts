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
 * Devil's Advocate mode strategy
 *
 * Characteristics:
 * - First agent: Normal position on the topic
 * - Second agent: Forced to take opposing stance (devil's advocate)
 * - Remaining agents: Evaluate and judge both perspectives
 * - Sequential execution to maintain role clarity
 *
 * Note: Uses custom executeRound with role-based prompts and stance validation
 */
export class DevilsAdvocateMode extends BaseModeStrategy {
  readonly name = 'devils-advocate';

  /**
   * Execute a devil's advocate round
   *
   * Agents respond sequentially with different roles:
   * - Agent 0: Normal position
   * - Agent 1: Devil's advocate (must oppose)
   * - Agents 2+: Evaluators
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    const responses: AgentResponse[] = [];

    // Execute agents sequentially to maintain role clarity
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (!agent) continue;

      // Build context with responses from current round and mode-specific prompt
      // Pass explicit agent index to ensure correct role assignment
      const currentContext: DebateContext = {
        ...context,
        previousResponses: [
          ...context.previousResponses,
          ...responses,
        ],
        // Add mode-specific prompt based on agent role (index i in current round)
        modePrompt: this.buildAgentPromptForIndex(context, i),
      };

      agent.setToolkit(toolkit);
      const response = await agent.generateResponse(currentContext);

      // Validate and enforce stance for devils-advocate mode
      const validatedResponse = this.validateAndEnforceStance(response, i);
      responses.push(validatedResponse);
    }

    return responses;
  }

  /**
   * Get the expected stance for a given agent index in devils-advocate mode
   */
  private getExpectedStance(agentIndex: number): Stance {
    if (agentIndex === 0) return 'YES';
    if (agentIndex === 1) return 'NO';
    return 'NEUTRAL';
  }

  /**
   * Get the role name for a given agent index
   */
  private getRoleName(agentIndex: number): string {
    if (agentIndex === 0) return 'PRIMARY (Affirmative)';
    if (agentIndex === 1) return 'OPPOSITION (Devil\'s Advocate)';
    return 'EVALUATOR';
  }

  /**
   * Validate stance and enforce expected value if missing or incorrect
   * Logs warnings when stance doesn't match the expected role
   */
  private validateAndEnforceStance(response: AgentResponse, agentIndex: number): AgentResponse {
    const expectedStance = this.getExpectedStance(agentIndex);
    const actualStance = response.stance;
    const roleName = this.getRoleName(agentIndex);

    if (!actualStance) {
      // Stance missing - enforce expected stance
      logger.warn(
        {
          agentId: response.agentId,
          agentName: response.agentName,
          role: roleName,
          expectedStance,
        },
        'Agent did not provide stance, enforcing expected stance for role'
      );
      return { ...response, stance: expectedStance };
    }

    if (actualStance !== expectedStance) {
      // Stance mismatch - log warning and enforce expected stance
      logger.warn(
        {
          agentId: response.agentId,
          agentName: response.agentName,
          role: roleName,
          expectedStance,
          actualStance,
        },
        'Agent stance does not match assigned role, enforcing expected stance'
      );
      return { ...response, stance: expectedStance };
    }

    // Stance is correct
    logger.debug(
      {
        agentId: response.agentId,
        agentName: response.agentName,
        role: roleName,
        stance: actualStance,
      },
      'Agent stance matches assigned role'
    );
    return response;
  }

  /**
   * Build devil's advocate-specific prompt
   *
   * Role assignment:
   * - First agent: Present normal position
   * - Second agent: Take opposing stance (devil's advocate)
   * - Remaining agents: Evaluate both perspectives
   *
   * Note: This method uses previousResponses.length to infer agent index.
   * For accurate role assignment during sequential execution, use
   * buildAgentPromptForIndex() with explicit index instead.
   */
  buildAgentPrompt(context: DebateContext): string {
    // Use previousResponses length as agent index (works when called with accumulated responses)
    const agentIndex = context.previousResponses.length;
    return this.buildAgentPromptForIndex(context, agentIndex);
  }

  /**
   * Build devil's advocate-specific prompt with explicit agent index
   *
   * This method is used internally by executeRound to ensure correct
   * role assignment when agents execute sequentially.
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
