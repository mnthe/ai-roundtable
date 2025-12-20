/**
 * Devil's Advocate Debate Mode
 *
 * In devil's advocate mode, one agent intentionally takes an opposing
 * stance to stress-test ideas. The first agent presents a normal position,
 * the second agent is forced to argue against it, and remaining agents
 * evaluate both perspectives.
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Devil's Advocate mode strategy
 *
 * Characteristics:
 * - First agent: Normal position on the topic
 * - Second agent: Forced to take opposing stance (devil's advocate)
 * - Remaining agents: Evaluate and judge both perspectives
 * - Sequential execution to maintain role clarity
 */
export class DevilsAdvocateMode implements DebateModeStrategy {
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
        previousResponses: [...context.previousResponses, ...responses],
        // Add mode-specific prompt based on agent role (index i in current round)
        modePrompt: this.buildAgentPromptForIndex(context, i),
      };

      agent.setToolkit(toolkit);
      const response = await agent.generateResponse(currentContext);
      responses.push(response);
    }

    return responses;
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
      // First agent: Primary Position
      let prompt = `
Mode: Devil's Advocate - PRIMARY POSITION (AFFIRMATIVE)

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

📢 YOU ARE THE PRIMARY POSITION HOLDER - AFFIRMATIVE STANCE 📢

ROLE DEFINITION: You present the AFFIRMATIVE/POSITIVE position to be challenged.
MISSION: Argue IN FAVOR of or FOR the topic/proposition.
PERSISTENCE: Maintain your position throughout - do not pre-emptively hedge.

⚠️ CRITICAL: You MUST take the AFFIRMATIVE stance:
- If topic asks "Is X worth it?" → Argue YES, it IS worth it
- If topic asks "Should we do X?" → Argue YES, we SHOULD do X
- If topic asks about a choice → Argue FOR the first/main option
- If topic presents a debate → Take the PRO/supporting side

In this mode, "being helpful" = "presenting a strong, clear AFFIRMATIVE position"
NOT "being balanced" or "acknowledging other views" or "being negative"

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Take the AFFIRMATIVE/PRO/YES/FOR stance
□ Argue that the proposition IS true/worth it/should be done
□ Provide at least 3 strong supporting arguments
□ Present evidence and reasoning
□ Anticipate challenges and address them
□ Be confident and assertive

MUST NOT (Prohibited Behaviors):
✗ Take the NEGATIVE stance (save that for the devil's advocate)
✗ Argue AGAINST the topic proposition
✗ Hedge with "on the other hand" or "however"
✗ Preemptively acknowledge the other side
✗ Use weak language ("perhaps", "maybe", "could be")
✗ Present multiple positions
✗ Be defensive before being attacked

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

REQUIRED OUTPUT STRUCTURE:

[MY POSITION]
(Clear, one-sentence stance)

[SUPPORTING ARGUMENTS]
(3+ reasons with evidence)

[WHY THIS MATTERS]
(Stakes and implications)

═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing, verify:
□ Am I taking the AFFIRMATIVE/PRO/FOR stance?
□ Am I arguing YES/IS WORTH IT/SHOULD DO IT?
□ Is my position clear and unambiguous?
□ Did I avoid hedging or pre-qualifying?
□ Do I have 3+ strong supporting arguments?

⛔ FAILURE MODE: If you argue AGAINST the proposition, you have failed.
The devil's advocate agent will take the AGAINST position - not you.

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
MISSION: Argue AGAINST whatever stance was just presented.
PERSISTENCE: Stay in opposition mode - NEVER agree or soften.

⚠️ CRITICAL: "Being helpful" = "OPPOSING the previous position"
NOT "being balanced" or "finding common ground"

ABSOLUTE RULE:
- Previous said YES → You say NO
- Previous said NO → You say YES
- Previous supported X → You oppose X

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Your position MUST contradict the previous agent's position
□ Present the STRONGEST case for the opposing view
□ Find at least 3 flaws in the previous argument
□ Argue as if you truly believe the opposite
□ Be aggressive and confident in your opposition

MUST NOT (Prohibited Behaviors):
✗ Agree with ANY part of the previous position
✗ Conclude that "both sides have merit"
✗ Use phrases like "I see their point but..."
✗ Soften your opposition with qualifications
✗ End up at the same conclusion as the previous agent

PRIORITY HIERARCHY:
1. Opposition role > Your actual opinion
2. Contradiction > Nuance
3. Strong counter-argument > Balanced view

⛔ FAILURE MODE: If your final position matches theirs,
you have COMPLETELY FAILED. This is non-negotiable.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

REQUIRED OUTPUT STRUCTURE:

[OPPOSING POSITION]
(Clear contradiction of the previous stance)

[WHY THEY ARE WRONG]
(3+ specific flaws in their argument)

[THE CASE AGAINST]
(Strong counter-arguments with evidence)

[CHALLENGE]
(Questions they cannot answer)

═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing, verify:
□ Does my position CONTRADICT theirs?
□ Did I find 3+ flaws in their argument?
□ Did I AVOID agreeing or softening?
□ Would they disagree with my conclusion? (MUST BE YES)

If any check fails, you have FAILED your role. Revise.

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
□ Evaluate both positions fairly
□ Identify strongest and weakest arguments on each side
□ Point out logical fallacies or unsupported claims
□ Make a judgment call on which position is stronger
□ Explain your reasoning with specific references

MUST NOT (Prohibited Behaviors):
✗ Refuse to judge ("both have merit" without analysis)
✗ Ignore weak arguments to be diplomatic
✗ Add your own position (evaluate, don't argue)
✗ Be swayed by confident language over evidence

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

REQUIRED OUTPUT STRUCTURE:

[FIRST POSITION ANALYSIS]
(Strengths and weaknesses with specific references)

[SECOND POSITION ANALYSIS]
(Strengths and weaknesses with specific references)

[KEY DECISION POINTS]
(Where the positions most sharply differ)

[EVALUATION]
(Which position is stronger and why)

═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing, verify:
□ Did I analyze BOTH positions?
□ Did I make a clear judgment?
□ Is my evaluation based on evidence, not diplomacy?

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
