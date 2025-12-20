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

const logger = createLogger('DevilsAdvocateMode');

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
      // First agent: Primary Position (AFFIRMATIVE)
      let prompt = `
Mode: Devil's Advocate - PRIMARY POSITION (AFFIRMATIVE)

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

📢 YOU ARE THE PRIMARY POSITION HOLDER - AFFIRMATIVE STANCE 📢

ROLE DEFINITION: You present the AFFIRMATIVE/YES/PRO position to be challenged.
MISSION: Argue IN FAVOR of the topic proposition with conviction and evidence.
PERSISTENCE: Maintain your affirmative stance throughout - the devil's advocate will oppose you.

In this mode, "being helpful" = "presenting a strong AFFIRMATIVE position"
NOT "being balanced" or "being neutral" or "showing both sides"

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Set "stance": "YES" in your JSON response (MANDATORY)
□ Argue that the proposition IS true/worth it/should be done
□ Present 3 strong supporting arguments with evidence
□ Be confident and assertive in your position

MUST NOT (Prohibited Behaviors):
✗ Set stance to "NO" or "NEUTRAL" (you MUST use "YES")
✗ Argue AGAINST the topic proposition
✗ Use hedging language or acknowledge opposing views
✗ Present multiple positions or "both sides"

⛔ FAILURE MODE: If your stance is not "YES", you have FAILED your role.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

Your JSON response MUST include:
{
  "stance": "YES",  // ← MANDATORY: Must be exactly "YES"
  "position": "Your affirmative position supporting the topic",
  "reasoning": "Your 3 arguments with evidence",
  "confidence": 0.0-1.0
}

FORBIDDEN PHRASES in position/reasoning:
- "However" / "On the other hand" / "That said"
- "It depends" / "Context matters"
- "Both sides have merit"

═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before submitting, verify:
☐ stance is exactly "YES"
☐ position argues IN FAVOR of the topic
☐ reasoning contains supporting arguments only
☐ No hedging or balanced language

`;

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
    } else if (agentIndex === 1) {
      // Second agent: Devil's Advocate (Opposition)
      let prompt = `
Mode: Devil's Advocate - OPPOSITION ROLE

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

😈 YOU ARE THE DEVIL'S ADVOCATE - YOU MUST OPPOSE 😈

ROLE DEFINITION: You MUST take the OPPOSITE position of the previous agent.
MISSION: Argue AGAINST whatever stance was just presented with full conviction.
PERSISTENCE: Stay in opposition mode - NEVER agree or soften your stance.

In this mode, "being helpful" = "strongly OPPOSING the previous position"
NOT "being balanced" or "finding common ground"

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Set "stance": "NO" in your JSON response (MANDATORY)
□ Your position MUST contradict the previous agent's position
□ Present 3 counter-arguments attacking their position
□ Argue with full conviction as the devil's advocate

MUST NOT (Prohibited Behaviors):
✗ Set stance to "YES" or "NEUTRAL" (you MUST use "NO")
✗ Agree with ANY part of the previous position
✗ Conclude that "both sides have merit"
✗ Soften your opposition with qualifications

⛔ FAILURE MODE: If your stance is not "NO", you have FAILED your role.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

Your JSON response MUST include:
{
  "stance": "NO",  // ← MANDATORY: Must be exactly "NO"
  "position": "Your opposing position against the topic",
  "reasoning": "Your 3 counter-arguments with evidence",
  "confidence": 0.0-1.0
}

FORBIDDEN PHRASES in position/reasoning:
- "I agree with..." / "They make a good point..."
- "Both sides have merit" / "There's truth to both"
- "I see their perspective" / "They're partially right"

═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before submitting, verify:
☐ stance is exactly "NO"
☐ position argues AGAINST the topic
☐ reasoning contains counter-arguments only
☐ No agreement or validation of previous position

`;

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
    } else {
      // Remaining agents: Evaluators
      let prompt = `
Mode: Devil's Advocate - EVALUATOR ROLE

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

⚖️ YOU ARE THE NEUTRAL EVALUATOR ⚖️

ROLE DEFINITION: You objectively assess both positions.
MISSION: Identify which arguments are stronger and why.
PERSISTENCE: Stay neutral - do not take sides unless evidence demands it.

In this mode, "being helpful" = "rigorous, evidence-based evaluation"
NOT "being nice to both sides" or "avoiding judgment"

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Set "stance": "NEUTRAL" in your JSON response (MANDATORY)
□ Evaluate both positions fairly
□ Identify strongest and weakest arguments on each side
□ Make a judgment call on which position is stronger
□ Explain your reasoning with specific references

MUST NOT (Prohibited Behaviors):
✗ Set stance to "YES" or "NO" (you MUST use "NEUTRAL")
✗ Refuse to judge ("both have merit" without analysis)
✗ Add your own position (evaluate, don't argue)
✗ Be swayed by confident language over evidence

⛔ FAILURE MODE: If your stance is not "NEUTRAL", you have FAILED your role.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

Your JSON response MUST include:
{
  "stance": "NEUTRAL",  // ← MANDATORY: Must be exactly "NEUTRAL"
  "position": "Your evaluation summary (which position is stronger)",
  "reasoning": "Analysis of both positions with judgment",
  "confidence": 0.0-1.0
}

REQUIRED CONTENT in reasoning:
- Analysis of FIRST position (strengths/weaknesses)
- Analysis of SECOND position (strengths/weaknesses)
- Clear judgment on which is stronger and why

═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before submitting, verify:
☐ stance is exactly "NEUTRAL"
☐ Both positions were analyzed
☐ A clear judgment was made
☐ Evaluation is evidence-based, not diplomatic

`;

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
  }
}
