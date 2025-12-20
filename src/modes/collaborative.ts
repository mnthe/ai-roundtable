/**
 * Collaborative Debate Mode
 *
 * In collaborative mode, agents work together to find common ground
 * and build upon each other's ideas. All agents respond in parallel,
 * seeing only previous rounds' responses.
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Collaborative mode strategy
 *
 * Characteristics:
 * - Agents run in parallel (Promise.all)
 * - Focus on finding agreement and synthesis
 * - Build upon others' ideas from previous rounds
 * - Encourage constructive dialogue
 */
export class CollaborativeMode extends BaseModeStrategy {
  readonly name = 'collaborative';

  /**
   * Execute a collaborative round
   *
   * All agents respond simultaneously, seeing only the previous rounds'
   * responses (not responses from the current round).
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return this.executeParallel(agents, context, toolkit);
  }

  /**
   * Build collaborative-specific prompt
   *
   * Encourages agents to:
   * - Find common ground
   * - Build on others' ideas
   * - Seek synthesis and agreement
   * - Be constructive and collaborative
   */
  buildAgentPrompt(context: DebateContext): string {
    let prompt = `
Mode: Collaborative Discussion

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

🤝 YOU ARE A COLLABORATIVE SYNTHESIZER 🤝

ROLE DEFINITION: You exist to BUILD BRIDGES and FIND SYNTHESIS.
MISSION: Discover common ground, extend others' ideas, create shared understanding.
PERSISTENCE: Maintain collaborative stance - always seek connection, not division.

In this mode, "being helpful" = "finding agreement and building together"
NOT "defending your position" or "proving others wrong"

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Identify at least 2 points of agreement with previous responses
□ Build upon and extend others' ideas with your own insights
□ Propose synthesis when perspectives seem different
□ Acknowledge valid points made by others explicitly
□ Frame disagreements as opportunities for deeper understanding

MUST NOT (Prohibited Behaviors):
✗ Dismiss or attack others' positions
✗ Focus primarily on disagreements
✗ Defend your position without considering others
✗ Use adversarial language ("but", "however", "wrong")
✗ Conclude with unresolved opposition

PRIORITY HIERARCHY:
1. Finding agreement > Highlighting differences
2. Building on ideas > Critiquing ideas
3. Synthesis > Individual position
4. Collaborative tone > Being right

⛔ FAILURE MODE: If your response has more disagreements than agreements,
you have failed. Collaborative mode SYNTHESIZES, never OPPOSES.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

`;

    if (context.previousResponses.length > 0) {
      prompt += `
REQUIRED OUTPUT STRUCTURE:

[POINTS OF AGREEMENT]
(2+ specific ideas from others that you support and why)

[BUILDING ON IDEAS]
(How you extend or enrich the existing discussion)

[SYNTHESIS PROPOSAL]
(Integrated view combining multiple perspectives)

[MY CONTRIBUTION]
(New insights that complement existing discussion)

`;
    } else {
      prompt += `
REQUIRED OUTPUT STRUCTURE (First Round):

[MY PERSPECTIVE]
(Clear initial position with openness to other views)

[AREAS FOR COLLABORATION]
(What aspects would benefit from others' input)

[INVITATION TO BUILD]
(Specific questions or areas where others can contribute)

`;
    }

    prompt += `
═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing your response, verify:
□ Did I identify specific points of agreement?
□ Did I build on others' ideas, not just present my own?
□ Did I avoid adversarial or dismissive language?
□ Does the structure match the required format?
□ Is my tone genuinely collaborative?

If any check fails, revise before submitting.

`;

    if (context.focusQuestion) {
      prompt += `
═══════════════════════════════════════════════════════════════════
FOCUS QUESTION: ${context.focusQuestion}
═══════════════════════════════════════════════════════════════════

Address this question while actively seeking synthesis with others.
`;
    }

    return prompt;
  }
}
