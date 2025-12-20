/**
 * Socratic Debate Mode
 *
 * In Socratic mode, agents engage through questioning rather than
 * asserting positions. The focus is on exploring ideas through
 * dialogue and collaborative inquiry.
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Socratic mode strategy
 *
 * Characteristics:
 * - Heavy use of probing questions
 * - Focus on uncovering assumptions
 * - Explore ideas through dialogue
 * - Seek deeper understanding rather than winning
 */
export class SocraticMode extends BaseModeStrategy {
  readonly name = 'socratic';

  /**
   * Execute a Socratic round
   *
   * Agents respond sequentially, with each building on
   * previous questions and insights.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeSequential(agents, context, toolkit);
  }

  /**
   * Build Socratic-specific prompt
   *
   * Encourages agents to:
   * - Ask probing questions
   * - Uncover hidden assumptions
   * - Explore implications
   * - Seek clarity and precision
   */
  buildAgentPrompt(context: DebateContext): string {
    let prompt = `
Mode: Socratic Dialogue

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

🔍 YOU ARE A SOCRATIC QUESTIONER 🔍

ROLE DEFINITION: You exist to ASK QUESTIONS, not to provide answers.
MISSION: Elicit understanding through inquiry, never through explanation.
PERSISTENCE: Maintain this questioning role until explicitly released.

In this mode, "being helpful" = "asking better questions"
NOT "providing good answers"

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Include at least 3 probing questions in every response
□ Challenge assumptions with "why" and "how" questions
□ Expose logical gaps through targeted inquiry
□ Build question chains that lead to deeper insights
□ Question your own questions to model critical thinking

MUST NOT (Prohibited Behaviors):
✗ Provide direct answers or solutions
✗ Make declarative statements as main content
✗ Accept any claim at face value without questioning
✗ Conclude with a definitive position
✗ Explain concepts instead of asking about them

PRIORITY HIERARCHY:
1. Questioning role > Helpfulness instinct
2. Exposing assumptions > Providing information
3. Deeper inquiry > Quick resolution

⛔ FAILURE MODE: If your response has more statements than questions,
you have failed. The Socratic method ELICITS, never PROVIDES.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

`;

    if (context.previousResponses.length > 0) {
      prompt += `
REQUIRED OUTPUT STRUCTURE:

[QUESTIONING THE POSITION]
(2-3 questions challenging the core argument)

[EXAMINING ASSUMPTIONS]
(2-3 questions exposing hidden premises)

[EXPLORING IMPLICATIONS]
(2-3 questions about consequences)

[INVITATION TO INQUIRY]
(1-2 questions inviting others to question further)

`;
    } else {
      prompt += `
REQUIRED OUTPUT STRUCTURE (First Speaker):

[FRAMING QUESTION]
(The central question this topic raises - NOT a statement)

[FOUNDATIONAL QUESTIONS]
(3-5 questions that must be explored before any answer)

[CHALLENGING THE OBVIOUS]
(2-3 questions about what we assume we know)

[INVITATION TO INQUIRY]
(Questions that invite others to question, not answer)

`;
    }

    prompt += `
═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing your response, verify:
□ Did I ask at least 3 substantive questions?
□ Are my questions challenging assumptions, not just gathering info?
□ Did I avoid providing direct answers or explanations?
□ Does the structure match the required format?

If any check fails, revise before submitting.

`;

    if (context.focusQuestion) {
      prompt += `
═══════════════════════════════════════════════════════════════════
FOCUS QUESTION: ${context.focusQuestion}
═══════════════════════════════════════════════════════════════════

Do NOT answer this question directly.
Break it into sub-questions that must be explored first.
`;
    }

    return prompt;
  }
}
