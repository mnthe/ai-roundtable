/**
 * Adversarial Debate Mode
 *
 * In adversarial mode, agents take opposing stances and challenge
 * each other's arguments. This mode is designed to stress-test ideas
 * and expose weaknesses in reasoning.
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Adversarial mode strategy
 *
 * Characteristics:
 * - Agents take opposing or critical stances
 * - Focus on challenging and testing arguments
 * - Look for weaknesses and counter-arguments
 * - Encourage rigorous debate and steel-manning
 */
export class AdversarialMode implements DebateModeStrategy {
  readonly name = 'adversarial';

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
    if (agents.length === 0) {
      return [];
    }

    const responses: AgentResponse[] = [];

    // Execute agents sequentially so each can challenge the previous
    for (const agent of agents) {
      // Build context with responses from current round and mode-specific prompt
      const currentContext: DebateContext = {
        ...context,
        previousResponses: [
          ...context.previousResponses,
          ...responses, // Include current round responses
        ],
        // Add mode-specific prompt
        modePrompt: this.buildAgentPrompt({
          ...context,
          previousResponses: [...context.previousResponses, ...responses],
        }),
      };

      agent.setToolkit(toolkit);
      const response = await agent.generateResponse(currentContext);
      responses.push(response);
    }

    return responses;
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
    let prompt = `
Mode: Adversarial Debate

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

⚔️ YOU ARE A RIGOROUS CHALLENGER ⚔️

ROLE DEFINITION: You exist to CHALLENGE and STRESS-TEST arguments.
MISSION: Find weaknesses, expose flaws, provide the strongest counter-arguments.
PERSISTENCE: Maintain adversarial stance until explicitly released.

In this mode, "being helpful" = "providing the strongest challenge"
NOT "finding common ground" or "being agreeable"

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Steel-man the opposing view BEFORE attacking it
□ Identify at least 3 weaknesses or flaws in any argument
□ Provide counter-evidence or counter-examples
□ Challenge underlying assumptions explicitly
□ Take a clear, strong position - no fence-sitting

MUST NOT (Prohibited Behaviors):
✗ Agree with previous positions without finding flaws first
✗ Use hedging language ("perhaps", "it could be", "in some cases")
✗ Conclude with "both sides have merit"
✗ Soften your critique to avoid conflict
✗ Accept claims without demanding evidence

PRIORITY HIERARCHY:
1. Challenging role > Agreeableness instinct
2. Finding flaws > Finding agreement
3. Strong position > Balanced view

⛔ FAILURE MODE: If you end up agreeing more than disagreeing,
you have failed. Adversarial debate requires OPPOSITION.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

`;

    if (context.previousResponses.length > 0) {
      prompt += `
REQUIRED OUTPUT STRUCTURE:

[STEEL-MAN SUMMARY]
(Strongest version of the position you're about to challenge)

[CRITICAL WEAKNESSES]
(3+ specific flaws, gaps, or errors in the argument)

[COUNTER-ARGUMENTS]
(Your opposing position with evidence/reasoning)

[CHALLENGE TO DEFEND]
(Direct questions the opponent must answer)

`;
    } else {
      prompt += `
REQUIRED OUTPUT STRUCTURE (First Speaker):

[STRONG POSITION]
(Clear, unambiguous stance on the topic)

[SUPPORTING ARGUMENTS]
(3+ reasons with evidence)

[ANTICIPATED ATTACKS]
(Weaknesses others might find - and your preemptive defense)

[CHALLENGE TO OPPONENTS]
(Direct questions for those who disagree)

`;
    }

    prompt += `
═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing your response, verify:
□ Did I identify specific weaknesses, not just vague concerns?
□ Is my counter-position clear and strong?
□ Did I avoid agreeing or softening my critique?
□ Does the structure match the required format?

If any check fails, revise before submitting.

`;

    if (context.focusQuestion) {
      prompt += `
═══════════════════════════════════════════════════════════════════
FOCUS QUESTION: ${context.focusQuestion}
═══════════════════════════════════════════════════════════════════

Take a STRONG position. Do not hedge. Be prepared to defend vigorously.
`;
    }

    return prompt;
  }
}
