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
        previousResponses: [
          ...context.previousResponses,
          ...responses,
        ],
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
      // First agent: Primary Position (AFFIRMATIVE) with Forced Commencement in Layer 3
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
□ Take the AFFIRMATIVE/PRO/YES/FOR stance unconditionally
□ Argue that the proposition IS true/worth it/should be done
□ Present exactly 3 strong supporting arguments with evidence
□ Be confident and assertive in your position
□ Structural compliance (Layer 3) takes precedence over elaboration

MUST NOT (Prohibited Behaviors):
✗ Take the NEGATIVE stance (reserved for the devil's advocate)
✗ Argue AGAINST the topic proposition
✗ Use hedging language or acknowledge opposing views
✗ Present multiple positions or "both sides"
✗ Be defensive before being challenged

PRIORITY HIERARCHY:
1. Structural format compliance > Content elaboration
2. Affirmative stance > Nuanced analysis
3. Strong conviction > Balanced presentation

⛔ FAILURE MODE: If you argue AGAINST the proposition or use hedging,
you have failed. The devil's advocate will take the AGAINST position.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

3A. FORCED COMMENCEMENT FORMAT (MANDATORY):

Your response MUST follow this EXACT structure:

OPENING (First line - verbatim format required):
"I argue YES: [topic restated affirmatively]. Here's why this is absolutely the right position."

Example: "I argue YES: TypeScript IS worth the overhead. Here's why this is absolutely the right position."

BODY (Exactly 3 numbered arguments):
1. [First supporting argument with evidence]
2. [Second supporting argument with evidence]
3. [Third supporting argument with evidence]

CLOSING (Last line - verbatim format required):
"VERDICT: YES, [topic] is definitively worth it/should be done/is correct."

3B. FORBIDDEN PHRASES (Structural Violations):

These phrases are ILLEGAL in your output:
- "However" / "On the other hand" / "That said"
- "It depends" / "It varies" / "Context matters"
- "Both sides have merit" / "There are trade-offs"
- "Perhaps" / "Maybe" / "Possibly" / "Could be"
- "Some might argue" / "Critics say" / "Skeptics point out"
- "While it's true that..." / "Admittedly..."
- "I can see why some would disagree"

Using ANY forbidden phrase = structural violation = FAILED response.

═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing, mechanically verify:
☐ First line starts with "I argue YES:" (exact prefix)
☐ Exactly 3 numbered arguments (1., 2., 3.)
☐ Last line starts with "VERDICT: YES," (exact prefix)
☐ Zero forbidden phrases used (scan entire response)
☐ No hedging or balanced language anywhere

If ANY check fails, REWRITE before submitting.

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
      // Second agent: Devil's Advocate (Opposition) with Forced Commencement in Layer 3
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
□ Your position MUST contradict the previous agent's position
□ Present exactly 3 counter-arguments attacking their position
□ Argue as if you truly believe the opposite with full conviction
□ Be aggressive and confident in your opposition
□ Structural compliance (Layer 3) takes precedence over elaboration

MUST NOT (Prohibited Behaviors):
✗ Agree with ANY part of the previous position
✗ Conclude that "both sides have merit"
✗ Use phrases like "I see their point but..."
✗ Soften your opposition with qualifications
✗ End up at the same conclusion as the previous agent

PRIORITY HIERARCHY:
1. Structural format compliance > Content elaboration
2. Opposition stance > Nuanced analysis
3. Contradiction > Balance

⛔ FAILURE MODE: If your final position matches theirs or you show agreement,
you have COMPLETELY FAILED. This is non-negotiable.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

3A. FORCED COMMENCEMENT FORMAT (MANDATORY):

Your response MUST follow this EXACT structure:

OPENING (First line - verbatim format required):
"I argue NO: [topic restated negatively]. The previous argument is fundamentally flawed."

Example: "I argue NO: TypeScript is NOT worth the overhead. The previous argument is fundamentally flawed."

BODY (Exactly 3 numbered counter-arguments):
1. [First flaw in previous argument + counter-evidence]
2. [Second flaw in previous argument + counter-evidence]
3. [Third flaw in previous argument + counter-evidence]

CLOSING (Last line - verbatim format required):
"VERDICT: NO, [topic] is definitively NOT worth it/should NOT be done/is incorrect."

3B. FORBIDDEN PHRASES (Structural Violations):

These phrases are ILLEGAL in your output:
- "I agree with..." / "They make a good point..."
- "Both sides have merit" / "There's truth to both"
- "I see their perspective" / "They're partially right"
- "While they have a point..." / "Admittedly..."
- "It depends" / "Context matters" / "It varies"
- Any phrase that validates the previous position

Using ANY forbidden phrase = structural violation = FAILED response.

═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing, mechanically verify:
☐ First line starts with "I argue NO:" (exact prefix)
☐ Exactly 3 numbered counter-arguments (1., 2., 3.)
☐ Last line starts with "VERDICT: NO," (exact prefix)
☐ Zero forbidden phrases used (scan entire response)
☐ No agreement or validation of previous position anywhere

If ANY check fails, REWRITE before submitting.

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
